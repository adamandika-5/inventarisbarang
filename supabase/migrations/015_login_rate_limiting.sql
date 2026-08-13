-- Migration 015: Distributed login rate limiting for the Vercel deployment.
--
-- The application sends only keyed SHA-256 hashes. Raw usernames and client
-- addresses are intentionally never stored in PostgreSQL.

CREATE TABLE private.login_rate_limit_buckets (
  bucket_type       TEXT        NOT NULL,
  bucket_key        TEXT        NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count     INTEGER     NOT NULL DEFAULT 0,
  blocked_until     TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT login_rate_limit_buckets_pkey
    PRIMARY KEY (bucket_type, bucket_key),
  CONSTRAINT login_rate_limit_buckets_type_check
    CHECK (bucket_type IN ('ACCOUNT_IP', 'ACCOUNT', 'IP')),
  CONSTRAINT login_rate_limit_buckets_key_check
    CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT login_rate_limit_buckets_attempt_count_check
    CHECK (attempt_count >= 0)
);

CREATE INDEX login_rate_limit_buckets_updated_at_idx
  ON private.login_rate_limit_buckets (updated_at);

ALTER TABLE private.login_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.login_rate_limit_buckets
FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE private.login_rate_limit_buckets IS
  'Opaque, short-lived counters used by the server-side login rate limiter.';


-- Consume one attempt from a single bucket. An advisory transaction lock
-- serializes concurrent requests for the same key before the row is read.
CREATE FUNCTION private.consume_login_rate_limit_bucket(
  p_bucket_type TEXT,
  p_bucket_key  TEXT,
  p_limit       INTEGER,
  p_window      INTERVAL,
  p_block       INTERVAL
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now        TIMESTAMPTZ := clock_timestamp();
  v_bucket     RECORD;
  v_next_count INTEGER;
  v_retry      INTEGER;
BEGIN
  IF p_bucket_type NOT IN ('ACCOUNT_IP', 'ACCOUNT', 'IP') THEN
    RAISE EXCEPTION 'INVALID_BUCKET_TYPE';
  END IF;

  IF p_bucket_key IS NULL OR p_bucket_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_BUCKET_KEY';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR
     p_window IS NULL OR p_window <= INTERVAL '0 seconds' OR
     p_block IS NULL OR p_block <= INTERVAL '0 seconds' THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_CONFIGURATION';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_bucket_type || ':' || p_bucket_key, 0)
  );

  SELECT
    bucket.window_started_at,
    bucket.attempt_count,
    bucket.blocked_until
  INTO v_bucket
  FROM private.login_rate_limit_buckets AS bucket
  WHERE bucket.bucket_type = p_bucket_type
    AND bucket.bucket_key = p_bucket_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO private.login_rate_limit_buckets (
      bucket_type,
      bucket_key,
      window_started_at,
      attempt_count,
      blocked_until,
      updated_at
    ) VALUES (
      p_bucket_type,
      p_bucket_key,
      v_now,
      1,
      NULL,
      v_now
    );

    RETURN QUERY SELECT TRUE, 0;
    RETURN;
  END IF;

  IF v_bucket.blocked_until IS NOT NULL AND v_bucket.blocked_until > v_now THEN
    v_retry := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_bucket.blocked_until - v_now)))::INTEGER
    );

    UPDATE private.login_rate_limit_buckets AS bucket
    SET updated_at = v_now
    WHERE bucket.bucket_type = p_bucket_type
      AND bucket.bucket_key = p_bucket_key;

    RETURN QUERY SELECT FALSE, v_retry;
    RETURN;
  END IF;

  IF v_bucket.window_started_at <= v_now - p_window THEN
    UPDATE private.login_rate_limit_buckets AS bucket
    SET window_started_at = v_now,
        attempt_count = 1,
        blocked_until = NULL,
        updated_at = v_now
    WHERE bucket.bucket_type = p_bucket_type
      AND bucket.bucket_key = p_bucket_key;

    RETURN QUERY SELECT TRUE, 0;
    RETURN;
  END IF;

  v_next_count := v_bucket.attempt_count + 1;

  IF v_next_count > p_limit THEN
    UPDATE private.login_rate_limit_buckets AS bucket
    SET attempt_count = v_next_count,
        blocked_until = v_now + p_block,
        updated_at = v_now
    WHERE bucket.bucket_type = p_bucket_type
      AND bucket.bucket_key = p_bucket_key;

    RETURN QUERY SELECT FALSE, CEIL(EXTRACT(EPOCH FROM p_block))::INTEGER;
    RETURN;
  END IF;

  UPDATE private.login_rate_limit_buckets AS bucket
  SET attempt_count = v_next_count,
      blocked_until = NULL,
      updated_at = v_now
  WHERE bucket.bucket_type = p_bucket_type
    AND bucket.bucket_key = p_bucket_key;

  RETURN QUERY SELECT TRUE, 0;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_login_rate_limit_bucket(
  TEXT, TEXT, INTEGER, INTERVAL, INTERVAL
) FROM PUBLIC, anon, authenticated;


-- The public wrapper has fixed policy values so callers cannot weaken them:
--   * 5 attempts per account + network
--   * 10 attempts per account across networks
--   * 60 attempts per network across accounts
-- All three use a 15-minute window and a 15-minute temporary block.
CREATE FUNCTION public.consume_login_rate_limit(
  p_account_hash    TEXT,
  p_ip_hash         TEXT,
  p_account_ip_hash TEXT
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_ip_allowed BOOLEAN;
  v_account_ip_retry   INTEGER;
  v_account_allowed    BOOLEAN;
  v_account_retry      INTEGER;
  v_ip_allowed         BOOLEAN;
  v_ip_retry           INTEGER;
BEGIN
  -- Lazy cleanup keeps the table bounded without requiring pg_cron.
  DELETE FROM private.login_rate_limit_buckets AS bucket
  WHERE bucket.updated_at < clock_timestamp() - INTERVAL '24 hours';

  SELECT result.allowed, result.retry_after_seconds
  INTO v_account_ip_allowed, v_account_ip_retry
  FROM private.consume_login_rate_limit_bucket(
    'ACCOUNT_IP', p_account_ip_hash, 5,
    INTERVAL '15 minutes', INTERVAL '15 minutes'
  ) AS result;

  SELECT result.allowed, result.retry_after_seconds
  INTO v_account_allowed, v_account_retry
  FROM private.consume_login_rate_limit_bucket(
    'ACCOUNT', p_account_hash, 10,
    INTERVAL '15 minutes', INTERVAL '15 minutes'
  ) AS result;

  SELECT result.allowed, result.retry_after_seconds
  INTO v_ip_allowed, v_ip_retry
  FROM private.consume_login_rate_limit_bucket(
    'IP', p_ip_hash, 60,
    INTERVAL '15 minutes', INTERVAL '15 minutes'
  ) AS result;

  RETURN QUERY
  SELECT
    v_account_ip_allowed AND v_account_allowed AND v_ip_allowed,
    GREATEST(v_account_ip_retry, v_account_retry, v_ip_retry);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_login_rate_limit(TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_login_rate_limit(TEXT, TEXT, TEXT)
TO service_role;


-- A successful login clears the account-wide and current account + network
-- counters. The network-wide counter remains intact so one successful login
-- cannot erase abusive traffic affecting other accounts.
CREATE FUNCTION public.reset_login_rate_limit(
  p_account_hash    TEXT,
  p_account_ip_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_account_hash IS NULL OR p_account_hash !~ '^[0-9a-f]{64}$' OR
     p_account_ip_hash IS NULL OR p_account_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_BUCKET_KEY';
  END IF;

  DELETE FROM private.login_rate_limit_buckets AS bucket
  WHERE (bucket.bucket_type = 'ACCOUNT' AND bucket.bucket_key = p_account_hash)
     OR (bucket.bucket_type = 'ACCOUNT_IP' AND bucket.bucket_key = p_account_ip_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_login_rate_limit(TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reset_login_rate_limit(TEXT, TEXT)
TO service_role;

NOTIFY pgrst, 'reload schema';
