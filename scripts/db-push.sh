#!/usr/bin/env bash
# Push pending migrations to the Resto Supabase project, safely.
#
# The Supabase CLI pushes to whatever project is recorded in supabase/.temp/project-ref,
# which can be left pointing at a different project. This script links the
# Resto project and HARD-VERIFIES the linked ref before pushing.
#
# Usage: ./scripts/db-push.sh            (reads VITE_SUPABASE_PROJECT_ID from .env)
#        ./scripts/db-push.sh <project-ref>
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${1:-}"
if [ -z "$REF" ] && [ -f .env ]; then
  REF="$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | cut -d= -f2- | tr -d '"'"'"' ')"
fi
if [ -z "$REF" ] || [ "$REF" = "your-project-ref" ]; then
  echo "ABORT: no project ref. Set VITE_SUPABASE_PROJECT_ID in .env or pass it as an argument." >&2
  exit 1
fi

echo "Linking to Resto project ($REF)…"
supabase link --project-ref "$REF" >/dev/null

LINKED="$(cat supabase/.temp/project-ref)"
if [ "$LINKED" != "$REF" ]; then
  echo "ABORT: linked project is '$LINKED', expected '$REF'. Not pushing." >&2
  exit 1
fi

echo "Verified link = $LINKED. Pushing migrations…"
supabase db push --linked
echo "Done. Database is up to date."
