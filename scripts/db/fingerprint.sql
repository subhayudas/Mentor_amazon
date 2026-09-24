-- Catalog snapshot of schema public (plus the storage policies the repo defines), one line
-- per object, sorted: two databases built by different re-run chains must print the same
-- text. Used by scripts/db/verify-idempotency.sh and tests/integration (I1, I2).
-- Data is not part of it (applied_at timestamps, seeded rows).
WITH lines(line) AS (
  SELECT format('column %s.%s %s default=%s notnull=%s', c.table_name, c.column_name,
                CASE WHEN c.data_type = 'ARRAY' THEN c.udt_name ELSE c.data_type END,
                coalesce(c.column_default, '-'), c.is_nullable = 'NO')
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  UNION ALL
  SELECT format('constraint %s %s %s', con.conrelid::regclass, con.conname, pg_get_constraintdef(con.oid))
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relnamespace = 'public'::regnamespace
  UNION ALL
  SELECT format('index %s %s', i.indexname, i.indexdef)
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
  UNION ALL
  SELECT format('policy %s.%s %s %s roles=%s using=%s check=%s', p.schemaname, p.tablename, p.policyname, p.cmd,
                (SELECT string_agg(r, ',' ORDER BY r) FROM unnest(p.roles) r), coalesce(p.qual, '-'), coalesce(p.with_check, '-'))
  FROM pg_policies p
  WHERE p.schemaname = 'public' OR (p.schemaname = 'storage' AND p.tablename = 'objects')
  UNION ALL
  SELECT format('function %s(%s) secdef=%s config=%s acl=%s def=%s', pr.proname, pg_get_function_identity_arguments(pr.oid),
                pr.prosecdef, coalesce(array_to_string(pr.proconfig, ';'), '-'),
                coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(pr.proacl) a), '-'),
                md5(pg_get_functiondef(pr.oid)))
  FROM pg_proc pr
  WHERE pr.pronamespace = 'public'::regnamespace
  UNION ALL
  SELECT format('trigger %s %s', t.tgrelid::regclass, pg_get_triggerdef(t.oid))
  FROM pg_trigger t
  JOIN pg_class rel ON rel.oid = t.tgrelid
  WHERE rel.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
  UNION ALL
  SELECT format('relation %s kind=%s rls=%s acl=%s', rel.relname, rel.relkind, rel.relrowsecurity,
                coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(rel.relacl) a), '-'))
  FROM pg_class rel
  WHERE rel.relnamespace = 'public'::regnamespace AND rel.relkind IN ('r', 'v')
)
SELECT line FROM lines ORDER BY line;
