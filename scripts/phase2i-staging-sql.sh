#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 9 ]]; then
  echo "usage: phase2i-staging-sql.sh <cli-auth-file> <psql> <lib-dir> <target-ref> <expected-staging-ref> <production-ref> <sql-file> <output-file> <label>" >&2
  exit 64
fi

auth_file="$1"
psql_bin="$2"
lib_dir="$3"
target_ref="$4"
expected_staging_ref="$5"
production_ref="$6"
sql_file="$7"
output_file="$8"
label="$9"

cleanup() {
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
  rm -f -- "$auth_file"
}
trap cleanup EXIT

if [[ "$target_ref" != "$expected_staging_ref" || "$target_ref" == "$production_ref" ]]; then
  echo "RC_STAGING_TARGET_REQUIRED" >&2
  exit 65
fi
if [[ ! -x "$psql_bin" || ! -s "$sql_file" ]]; then
  echo "PHASE2I_STAGING_SQL_INPUT_MISSING" >&2
  exit 66
fi

printf 'TARGET_REF=%s\n' "$target_ref"

connection_exports="$(sed -n '/^export PGHOST=/,/^export PGDATABASE=/p' "$auth_file" | tr -d '\r')"
if [[ "$connection_exports" != *"PGPASSWORD="* || "$connection_exports" != *"PGDATABASE="* ]]; then
  echo "PHASE2I_CLI_CONNECTION_EXPORTS_MISSING" >&2
  exit 67
fi
eval "$connection_exports"
export LD_LIBRARY_PATH="$lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

mkdir -p -- "$(dirname -- "$output_file")"
"$psql_bin" --no-psqlrc --set=ON_ERROR_STOP=1 --command='SET ROLE postgres;' \
  --file="$sql_file" >"$output_file" 2>&1

printf 'PHASE2I_STAGING_SQL_%s=PASS\n' "$label"
