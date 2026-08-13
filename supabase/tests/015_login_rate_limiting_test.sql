-- Remote integration test for migration 015.
-- Run only on the disposable Supabase migration-test project after applying 015.
-- All test buckets are registered in a temporary table and deleted at the end.

DROP TABLE IF EXISTS pg_temp.tahap3_test_report;
DROP TABLE IF EXISTS pg_temp.tahap3_test_keys;

CREATE TEMP TABLE tahap3_test_report (
  test_no INTEGER PRIMARY KEY,
  status  TEXT NOT NULL,
  detail  TEXT NOT NULL
) ON COMMIT PRESERVE ROWS;

CREATE TEMP TABLE tahap3_test_keys (
  bucket_type TEXT NOT NULL,
  bucket_key  TEXT NOT NULL,
  PRIMARY KEY (bucket_type, bucket_key)
) ON COMMIT PRESERVE ROWS;


-- 1. Public clients cannot call either login-limiter RPC.
DO $$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.consume_login_rate_limit(text,text,text)',
       'EXECUTE'
     ) OR
     has_function_privilege(
       'authenticated',
       'public.consume_login_rate_limit(text,text,text)',
       'EXECUTE'
     ) OR
     has_function_privilege(
       'anon',
       'public.reset_login_rate_limit(text,text)',
       'EXECUTE'
     ) OR
     has_function_privilege(
       'authenticated',
       'public.reset_login_rate_limit(text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'anon/authenticated still has EXECUTE permission';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.consume_login_rate_limit(text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role is missing EXECUTE permission';
  END IF;

  INSERT INTO tahap3_test_report VALUES (
    1,
    'PASS',
    'limiter RPCs are restricted to service_role'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO tahap3_test_report VALUES (1, 'FAIL', SQLERRM);
END;
$$;


-- 2. The account + network bucket permits five attempts and blocks the sixth.
DO $$
DECLARE
  v_account TEXT := repeat('a', 64);
  v_ip      TEXT := repeat('b', 64);
  v_pair    TEXT := repeat('c', 64);
  v_allowed BOOLEAN;
  v_retry   INTEGER;
BEGIN
  INSERT INTO tahap3_test_keys VALUES
    ('ACCOUNT', v_account),
    ('IP', v_ip),
    ('ACCOUNT_IP', v_pair);

  FOR i IN 1..5 LOOP
    SELECT result.allowed, result.retry_after_seconds
    INTO v_allowed, v_retry
    FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'attempt % was blocked before the threshold', i;
    END IF;
  END LOOP;

  SELECT result.allowed, result.retry_after_seconds
  INTO v_allowed, v_retry
  FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

  IF v_allowed OR v_retry <= 0 THEN
    RAISE EXCEPTION 'sixth account + network attempt was not blocked';
  END IF;

  INSERT INTO tahap3_test_report VALUES (
    2,
    'PASS',
    'account + network threshold is 5 attempts per 15 minutes'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO tahap3_test_report VALUES (2, 'FAIL', SQLERRM);
END;
$$;


-- 3. The account-wide bucket follows a user across changing networks.
DO $$
DECLARE
  v_account TEXT := repeat('d', 64);
  v_ip      TEXT;
  v_pair    TEXT;
  v_allowed BOOLEAN;
  v_retry   INTEGER;
BEGIN
  INSERT INTO tahap3_test_keys VALUES ('ACCOUNT', v_account);

  FOR i IN 1..10 LOOP
    v_ip := lpad(to_hex(1000 + i), 64, '0');
    v_pair := lpad(to_hex(2000 + i), 64, '0');

    INSERT INTO tahap3_test_keys VALUES
      ('IP', v_ip),
      ('ACCOUNT_IP', v_pair);

    SELECT result.allowed, result.retry_after_seconds
    INTO v_allowed, v_retry
    FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'account attempt % was blocked before the threshold', i;
    END IF;
  END LOOP;

  v_ip := lpad(to_hex(1011), 64, '0');
  v_pair := lpad(to_hex(2011), 64, '0');
  INSERT INTO tahap3_test_keys VALUES
    ('IP', v_ip),
    ('ACCOUNT_IP', v_pair);

  SELECT result.allowed, result.retry_after_seconds
  INTO v_allowed, v_retry
  FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

  IF v_allowed OR v_retry <= 0 THEN
    RAISE EXCEPTION 'eleventh account-wide attempt was not blocked';
  END IF;

  INSERT INTO tahap3_test_report VALUES (
    3,
    'PASS',
    'account-wide threshold is 10 attempts across changing networks'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO tahap3_test_report VALUES (3, 'FAIL', SQLERRM);
END;
$$;


-- 4. A shared network gets a deliberately looser threshold for office Wi-Fi.
DO $$
DECLARE
  v_account TEXT;
  v_ip      TEXT := repeat('e', 64);
  v_pair    TEXT;
  v_allowed BOOLEAN;
  v_retry   INTEGER;
BEGIN
  INSERT INTO tahap3_test_keys VALUES ('IP', v_ip);

  FOR i IN 1..60 LOOP
    v_account := lpad(to_hex(3000 + i), 64, '0');
    v_pair := lpad(to_hex(4000 + i), 64, '0');

    INSERT INTO tahap3_test_keys VALUES
      ('ACCOUNT', v_account),
      ('ACCOUNT_IP', v_pair);

    SELECT result.allowed, result.retry_after_seconds
    INTO v_allowed, v_retry
    FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'network attempt % was blocked before the threshold', i;
    END IF;
  END LOOP;

  v_account := lpad(to_hex(3061), 64, '0');
  v_pair := lpad(to_hex(4061), 64, '0');
  INSERT INTO tahap3_test_keys VALUES
    ('ACCOUNT', v_account),
    ('ACCOUNT_IP', v_pair);

  SELECT result.allowed, result.retry_after_seconds
  INTO v_allowed, v_retry
  FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

  IF v_allowed OR v_retry <= 0 THEN
    RAISE EXCEPTION 'sixty-first network attempt was not blocked';
  END IF;

  INSERT INTO tahap3_test_report VALUES (
    4,
    'PASS',
    'network-wide threshold is 60 attempts for shared office Wi-Fi'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO tahap3_test_report VALUES (4, 'FAIL', SQLERRM);
END;
$$;


-- 5. Successful login reset clears account counters but preserves IP traffic.
DO $$
DECLARE
  v_account TEXT := repeat('f', 64);
  v_ip      TEXT := repeat('9', 64);
  v_pair    TEXT := repeat('8', 64);
  v_allowed BOOLEAN;
  v_count   INTEGER;
BEGIN
  INSERT INTO tahap3_test_keys VALUES
    ('ACCOUNT', v_account),
    ('IP', v_ip),
    ('ACCOUNT_IP', v_pair);

  SELECT result.allowed
  INTO v_allowed
  FROM public.consume_login_rate_limit(v_account, v_ip, v_pair) AS result;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'setup attempt unexpectedly blocked';
  END IF;

  PERFORM public.reset_login_rate_limit(v_account, v_pair);

  SELECT COUNT(*)
  INTO v_count
  FROM private.login_rate_limit_buckets AS bucket
  WHERE (bucket.bucket_type = 'ACCOUNT' AND bucket.bucket_key = v_account)
     OR (bucket.bucket_type = 'ACCOUNT_IP' AND bucket.bucket_key = v_pair);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'account counters were not reset';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM private.login_rate_limit_buckets AS bucket
  WHERE bucket.bucket_type = 'IP'
    AND bucket.bucket_key = v_ip;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'network-wide traffic counter was incorrectly reset';
  END IF;

  INSERT INTO tahap3_test_report VALUES (
    5,
    'PASS',
    'successful login reset preserves the network-wide counter'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO tahap3_test_report VALUES (5, 'FAIL', SQLERRM);
END;
$$;


DELETE FROM private.login_rate_limit_buckets AS bucket
USING tahap3_test_keys AS test_key
WHERE bucket.bucket_type = test_key.bucket_type
  AND bucket.bucket_key = test_key.bucket_key;

SELECT test_no, status, detail
FROM tahap3_test_report
ORDER BY test_no;
