#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 8 ]]; then
  echo "usage: phase2i-production-readonly-sql.sh <cli-auth-file> <psql> <lib-dir> <source-ref> <expected-production-ref> <sql-file> <output-file> <label>" >&2
  exit 64
fi

auth_file="$1"
psql_bin="$2"
lib_dir="$3"
source_ref="$4"
expected_production_ref="$5"
sql_file="$6"
output_file="$7"
label="$8"

cleanup() {
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
  rm -f -- "$auth_file"
}
trap cleanup EXIT

if [[ "$source_ref" != "$expected_production_ref" ]]; then
  echo "RC_PRODUCTION_READONLY_SOURCE_REQUIRED" >&2
  exit 65
fi
if [[ ! -x "$psql_bin" || ! -s "$sql_file" ]]; then
  echo "PHASE2I_PRODUCTION_READONLY_INPUT_MISSING" >&2
  exit 66
fi

printf 'SOURCE_REF=%s\n' "$source_ref"

connection_exports="$(sed -n '/^export PGHOST=/,/^export PGDATABASE=/p' "$auth_file" | tr -d '\r')"
if [[ "$connection_exports" != *"PGPASSWORD="* || "$connection_exports" != *"PGDATABASE="* ]]; then
  echo "PHASE2I_CLI_CONNECTION_EXPORTS_MISSING" >&2
  exit 67
fi
eval "$connection_exports"
export LD_LIBRARY_PATH="$lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

mkdir -p -- "$(dirname -- "$output_file")"
"$psql_bin" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --command='SET default_transaction_read_only = on; SET ROLE postgres;' \
  --file="$sql_file" >"$output_file" 2>&1

printf 'PHASE2I_PRODUCTION_READONLY_%s=PASS\n' "$label"
