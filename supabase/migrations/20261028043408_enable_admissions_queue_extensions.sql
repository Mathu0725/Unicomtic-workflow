-- Mirrors the migration applied to production through the Supabase connector.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
revoke usage on schema cron, net from public, anon, authenticated;
