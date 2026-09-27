#!/usr/bin/env bash
# Starts a throwaway Postgres + PostgREST with the Resto schema for tests/db-integration.ts.
# The storage schema is exposed too, so the test's fake Storage API can run as each user.
# Usage: tests/setup-db.sh <postgres-bin-dir> <postgrest-binary>
# Needs to run as a user that can run initdb (not root). Stop with: pg_ctl -D $DIR/data stop; kill the postgrest pid.
set -euo pipefail
PGBIN=${1:-/usr/lib/postgresql/16/bin}
POSTGREST=${2:-postgrest}
DIR=${TEST_DB_DIR:-/var/tmp/resto-test-db}
PORT=5499
ROOT=$(cd "$(dirname "$0")/.." && pwd)

# A previous pair would otherwise keep port 3900 and keep answering from the old
# data, so a rerun looked like a reset while the tests still saw last run's rows.
if [ -f "$DIR/postgrest.pid" ]; then kill "$(cat "$DIR/postgrest.pid")" 2>/dev/null || true; fi
if [ -d "$DIR/data" ]; then "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; fi
pkill -f "postgrest $DIR/postgrest.conf" 2>/dev/null || true
pkill -f "postgres -D $DIR/data" 2>/dev/null || true

rm -rf "$DIR" && mkdir -p "$DIR"
"$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=" -l "$DIR/pg.log" start >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1"
$PSQL -c "create database resto"

# Minimal stand-ins for what Supabase provides: roles, auth.users, auth.uid(),
# and the storage tables that Storage's row-level security runs against.
$PSQL -d resto <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role authenticator login noinherit password 'authenticator';
grant anon, authenticated to authenticator;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
SQL
for migration in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d resto -f "$migration"; done
# The fourth is an outsider who never joins a circle, so the "sees nothing"
# checks stay honest now that joining a circle shares everything in it.
$PSQL -d resto -c "insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444')"

cat > "$DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@/resto?host=$DIR&port=$PORT"
db-schemas = "public,storage"
db-anon-role = "anon"
jwt-secret = "test-secret-test-secret-test-secret-1234"
server-host = "127.0.0.1"
server-port = 3900
CONF
nohup "$POSTGREST" "$DIR/postgrest.conf" >"$DIR/postgrest.log" 2>&1 &
echo $! >"$DIR/postgrest.pid"
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:3900/ >/dev/null && break; sleep 0.3; done
echo "Postgres on $DIR:$PORT, PostgREST on http://127.0.0.1:3900"
