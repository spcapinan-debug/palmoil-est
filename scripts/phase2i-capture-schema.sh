#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 6 ]]; then
  echo "usage: phase2i-capture-schema.sh <cli-auth-file> <output-file> <pg_dump> <lib-dir> <source-ref> <expected-production-ref>" >&2
  exit 64
fi

auth_file="$1"
output_file="$2"
pg_dump_bin="$3"
lib_dir="$4"
source_ref="$5"
expected_production_ref="$6"

cleanup() {
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
  rm -f -- "$auth_file"
}
trap cleanup EXIT

if [[ "$source_ref" != "$expected_production_ref" ]]; then
  echo "RC_PRODUCTION_BASELINE_SOURCE_REQUIRED" >&2
  exit 65
fi

if [[ ! -x "$pg_dump_bin" ]]; then
  echo "PHASE2I_PG_DUMP_NOT_EXECUTABLE" >&2
  exit 66
fi

connection_exports="$(sed -n '/^export PGHOST=/,/^export PGDATABASE=/p' "$auth_file" | tr -d '\r')"
if [[ "$connection_exports" != *"PGPASSWORD="* || "$connection_exports" != *"PGDATABASE="* ]]; then
  echo "PHASE2I_CLI_CONNECTION_EXPORTS_MISSING" >&2
  exit 67
fi

eval "$connection_exports"
export LD_LIBRARY_PATH="$lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

mkdir -p -- "$(dirname -- "$output_file")"
"$pg_dump_bin" \
  --schema-only \
  --quote-all-identifiers \
  --no-owner \
  --role=postgres \
  --schema=public \
  --file="$output_file"

if [[ ! -s "$output_file" ]]; then
  echo "PHASE2I_BASELINE_DUMP_EMPTY" >&2
  exit 68
fi

echo "PHASE2I_SCHEMA_ONLY_DUMP_CREATED"
