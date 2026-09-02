#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 9 ]]; then
  echo "usage: phase2i-restore-schema.sh <cli-auth-file> <schema-file> <psql> <lib-dir> <target-ref> <expected-staging-ref> <production-ref> <expected-sha256> <log-file>" >&2
  exit 64
fi

auth_file="$1"
schema_file="$2"
psql_bin="$3"
lib_dir="$4"
target_ref="$5"
expected_staging_ref="$6"
production_ref="$7"
expected_sha256="$8"
log_file="$9"

cleanup() {
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
  rm -f -- "$auth_file"
}
trap cleanup EXIT

if [[ "$target_ref" != "$expected_staging_ref" || "$target_ref" == "$production_ref" ]]; then
  echo "RC_STAGING_TARGET_REQUIRED" >&2
  exit 65
fi

printf 'TARGET_REF=%s\n' "$target_ref"

if [[ ! -x "$psql_bin" ]]; then
  echo "PHASE2I_PSQL_INPUT_MISSING" >&2
  exit 66
fi
if [[ ! -s "$schema_file" ]]; then
  echo "PHASE2I_SCHEMA_INPUT_MISSING" >&2
  exit 66
fi

actual_sha256="$(sha256sum "$schema_file" | cut -d ' ' -f 1)"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "PHASE2I_BASELINE_SHA256_MISMATCH" >&2
  exit 67
fi

connection_exports="$(sed -n '/^export PGHOST=/,/^export PGDATABASE=/p' "$auth_file" | tr -d '\r')"
if [[ "$connection_exports" != *"PGPASSWORD="* || "$connection_exports" != *"PGDATABASE="* ]]; then
  echo "PHASE2I_CLI_CONNECTION_EXPORTS_MISSING" >&2
  exit 68
fi

eval "$connection_exports"
export LD_LIBRARY_PATH="$lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

mkdir -p -- "$(dirname -- "$log_file")"
{
  printf '%s\n' 'SET ROLE postgres;'
  printf '%s\n' 'CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;'
  printf '%s\n' 'DROP SCHEMA IF EXISTS supabase_migrations CASCADE;'
  printf '%s\n' 'DROP SCHEMA IF EXISTS public CASCADE;'
  # supabase_admin is platform-owned. Preserve its staging defaults and replay
  # application-owned public objects plus postgres-owned default ACLs verbatim.
  sed '/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/d' "$schema_file"
} | "$psql_bin" --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1 --file=- >"$log_file" 2>&1

echo "PHASE2I_STAGING_BASELINE_RESTORED"
