#!/usr/bin/env bash
# Creates / refreshes the least-privilege Postgres role used by the Marketing Studio worker and UI.
#
#   gb_studio  may SELECT/INSERT/UPDATE/DELETE the ms_* tables ONLY.
#   gb_studio has NO privilege on businesses, published_content, publishing_*, proof_ledger, jobs or any other table, so even a
#   bug cannot write a business, a House Account site, or the proof ledger.
#
# Idempotent. Run as root on the VPS AFTER `drizzle-kit push` has created the ms_* tables, and again after any schema change.
#   GB_STUDIO_PASSWORD=<secret> DB_NAME=gravyblock_prod bash scripts/ops/marketing-db-grants.sh
# GB_STUDIO_PASSWORD is only needed the first time (role creation). It is never echoed or stored here.
set -euo pipefail

DB_NAME="${DB_NAME:-gravyblock_prod}"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB_NAME")

role_exists="$(sudo -u postgres psql -X -Atc "select 1 from pg_roles where rolname='gb_studio'")"
if [ -z "$role_exists" ]; then
  : "${GB_STUDIO_PASSWORD:?GB_STUDIO_PASSWORD is required to create the gb_studio role}"
  # The password goes in on stdin (not argv), so it never appears in a process listing.
  sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres <<SQL
\set pw '$GB_STUDIO_PASSWORD'
create role gb_studio login password :'pw' nosuperuser nocreatedb nocreaterole noinherit connection limit 6;
SQL
fi

"${PSQL[@]}" <<SQL
revoke all on schema public from gb_studio;
revoke all on all tables in schema public from gb_studio;
revoke all on all sequences in schema public from gb_studio;
grant connect on database "$DB_NAME" to gb_studio;
grant usage on schema public to gb_studio;
do \$\$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'ms\_%' loop
    execute format('grant select, insert, update, delete on public.%I to gb_studio', t);
  end loop;
end \$\$;
SQL

echo "gb_studio grants applied on $DB_NAME:"
sudo -u postgres psql -X -d "$DB_NAME" -Atc "select count(*) || ' ms_ tables writable' from information_schema.role_table_grants where grantee='gb_studio' and privilege_type='INSERT'"
sudo -u postgres psql -X -d "$DB_NAME" -Atc "select count(*) || ' non-ms tables with any gb_studio privilege (must be 0)' from information_schema.role_table_grants where grantee='gb_studio' and table_name not like 'ms\_%'"
