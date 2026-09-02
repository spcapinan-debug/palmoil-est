#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 10 || $(( ($# - 8) % 2 )) -ne 0 ]]; then
  echo "usage: phase2i-replay-pending-migrations.sh <cli-auth-file> <psql> <lib-dir> <target-ref> <expected-staging-ref> <production-ref> <assert-sql> <summary-tsv> <migration-file> <sha256> [...]" >&2
  exit 64
fi

auth_file="$1"
psql_bin="$2"
lib_dir="$3"
target_ref="$4"
expected_staging_ref="$5"
production_ref="$6"
assert_sql="$7"
summary_tsv="$8"
shift 8

cleanup() {
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
  rm -f -- "$auth_file"
}
trap cleanup EXIT

if [[ "$target_ref" != "$expected_staging_ref" || "$target_ref" == "$production_ref" ]]; then
  echo "RC_STAGING_TARGET_REQUIRED" >&2
  exit 65
fi
if [[ ! -x "$psql_bin" || ! -s "$assert_sql" ]]; then
  echo "PHASE2I_REPLAY_INPUT_MISSING" >&2
  exit 66
fi

connection_exports="$(sed -n '/^export PGHOST=/,/^export PGDATABASE=/p' "$auth_file" | tr -d '\r')"
if [[ "$connection_exports" != *"PGPASSWORD="* || "$connection_exports" != *"PGDATABASE="* ]]; then
  echo "PHASE2I_CLI_CONNECTION_EXPORTS_MISSING" >&2
  exit 67
fi
eval "$connection_exports"
export LD_LIBRARY_PATH="$lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

mkdir -p -- "$(dirname -- "$summary_tsv")"
printf 'migration\tsha256\telapsed_ms\tfixture_rows\tpublic_tables\tpublic_views\tunvalidated_constraints\tresult\n' >"$summary_tsv"

while [[ $# -gt 0 ]]; do
  migration_file="$1"
  expected_sha256="$2"
  shift 2
  migration_name="$(basename -- "$migration_file")"
  migration_log="${summary_tsv%.tsv}.${migration_name%.sql}.log"

  if [[ ! -s "$migration_file" ]]; then
    echo "PHASE2I_MIGRATION_FILE_MISSING:$migration_name" >&2
    exit 68
  fi
  actual_sha256="$(sha256sum "$migration_file" | cut -d ' ' -f 1)"
  if [[ "$actual_sha256" != "$expected_sha256" ]]; then
    echo "PHASE2I_MIGRATION_SHA256_MISMATCH:$migration_name" >&2
    exit 69
  fi

  started_ns="$(date +%s%N)"
  if ! "$psql_bin" --no-psqlrc --set=ON_ERROR_STOP=1 \
      --command='SET ROLE postgres;' --file="$migration_file" >"$migration_log" 2>&1; then
    elapsed_ms="$(( ($(date +%s%N) - started_ns) / 1000000 ))"
    printf '%s\t%s\t%s\t\t\t\t\tFAIL\n' "$migration_name" "$actual_sha256" "$elapsed_ms" >>"$summary_tsv"
    tail -n 80 -- "$migration_log" >&2
    exit 70
  fi
  elapsed_ms="$(( ($(date +%s%N) - started_ns) / 1000000 ))"

  assertion_row="$("$psql_bin" --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --field-separator='|' --file="$assert_sql" | tail -n 1)"
  IFS='|' read -r fixture_rows public_tables public_views unvalidated_constraints <<<"$assertion_row"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\tPASS\n' \
    "$migration_name" "$actual_sha256" "$elapsed_ms" "$fixture_rows" \
    "$public_tables" "$public_views" "$unvalidated_constraints" >>"$summary_tsv"
done

echo "PHASE2I_PENDING_MIGRATION_REPLAY_COMPLETE"
