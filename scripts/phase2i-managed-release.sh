#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 9 || $(( ($# - 7) % 2 )) -ne 0 ]]; then
  echo "usage: phase2i-managed-release.sh <supabase> <target-ref> <expected-staging-ref> <production-ref> <apply|status> <push-log> <list-log> <migration-file> <sha256> [...]" >&2
  exit 64
fi

supabase_bin="$1"
target_ref="$2"
expected_staging_ref="$3"
production_ref="$4"
mode="$5"
push_log="$6"
list_log="$7"
shift 7

if [[ "$target_ref" != "$expected_staging_ref" || "$target_ref" == "$production_ref" ]]; then
  echo "RC_STAGING_TARGET_REQUIRED" >&2
  exit 65
fi
if [[ "$mode" != "apply" && "$mode" != "status" ]]; then
  echo "PHASE2I_MANAGED_RELEASE_MODE_INVALID" >&2
  exit 66
fi
if ! command -v "$supabase_bin" >/dev/null 2>&1 && [[ ! -x "$supabase_bin" ]]; then
  echo "PHASE2I_SUPABASE_CLI_MISSING" >&2
  exit 67
fi

printf 'TARGET_REF=%s\n' "$target_ref"

bundle="$(mktemp -d /tmp/phase2i-managed-release.XXXXXX)"
case "$(realpath -- "$bundle")" in
  /tmp/phase2i-managed-release.*) ;;
  *) echo "PHASE2I_MANAGED_RELEASE_TEMP_INVALID" >&2; exit 68 ;;
esac
cleanup() {
  case "$(realpath -- "$bundle" 2>/dev/null || true)" in
    /tmp/phase2i-managed-release.*) rm -rf -- "$bundle" ;;
  esac
}
trap cleanup EXIT

"$supabase_bin" init --workdir "$bundle" --yes >/dev/null
mkdir -p -- "$bundle/supabase/migrations"

migration_count=0
while [[ $# -gt 0 ]]; do
  migration_file="$1"
  expected_sha256="$2"
  shift 2
  migration_name="$(basename -- "$migration_file")"

  if [[ ! -s "$migration_file" ]]; then
    echo "PHASE2I_MIGRATION_FILE_MISSING:$migration_name" >&2
    exit 69
  fi
  actual_sha256="$(sha256sum "$migration_file" | cut -d ' ' -f 1)"
  if [[ "$actual_sha256" != "$expected_sha256" ]]; then
    echo "PHASE2I_MIGRATION_SHA256_MISMATCH:$migration_name" >&2
    exit 70
  fi
  cp -- "$migration_file" "$bundle/supabase/migrations/$migration_name"
  migration_count=$((migration_count + 1))
done

if [[ "$migration_count" -ne 7 ]]; then
  echo "PHASE2I_RELEASE_MIGRATION_COUNT_INVALID:$migration_count" >&2
  exit 71
fi

mkdir -p -- "$(dirname -- "$push_log")" "$(dirname -- "$list_log")"
if [[ "$mode" == "apply" ]]; then
  preflight_log="${push_log}.preflight"
  "$supabase_bin" db push --project-ref "$target_ref" --workdir "$bundle" \
    --dry-run --skip-vault >"$preflight_log" 2>&1
  pending_count="$(grep -Ec '^ • 20[0-9]{12}_.+[.]sql$' "$preflight_log" || true)"
  if [[ "$pending_count" -ne 7 ]]; then
    cat -- "$preflight_log" >&2
    echo "PHASE2I_MANAGED_PREFLIGHT_PENDING_INVALID:$pending_count" >&2
    exit 72
  fi
  "$supabase_bin" db push --project-ref "$target_ref" --workdir "$bundle" \
    --skip-vault --yes >"$push_log" 2>&1
else
  "$supabase_bin" db push --project-ref "$target_ref" --workdir "$bundle" \
    --dry-run --skip-vault >"$push_log" 2>&1
  if grep -q '^Would push these migrations:' "$push_log" ||
      ! grep -qi 'remote database is up to date' "$push_log"; then
    cat -- "$push_log" >&2
    echo "PHASE2I_DEPLOYMENT_REPLAY_NOT_IDEMPOTENT" >&2
    exit 73
  fi
fi

"$supabase_bin" migration list --project-ref "$target_ref" --workdir "$bundle" >"$list_log" 2>&1

if [[ "$mode" == "apply" ]]; then
  echo "PHASE2I_MANAGED_RELEASE_APPLY_COMPLETE"
else
  echo "DEPLOYMENT_REPLAY_IDEMPOTENT=PASS"
fi
