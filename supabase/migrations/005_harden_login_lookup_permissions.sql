-- Explicitly restrict login lookup RPC to the service role.

REVOKE EXECUTE
ON FUNCTION public.lookup_login_identifier(TEXT)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.lookup_login_identifier(TEXT)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.lookup_login_identifier(TEXT)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.lookup_login_identifier(TEXT)
TO service_role;