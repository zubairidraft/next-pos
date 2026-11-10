-- Pin search_path on the internal mirror / report functions (Supabase security
-- advisor 0011). Every name inside them is already schema-qualified.
DO $sp$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('mirror', 'rpt') LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, pg_temp', f);
  END LOOP;
END $sp$;
