#!/usr/bin/env bash
set -euo pipefail

LANG="${1:-en}"

case "$LANG" in
  en|cn) ;;
  *) echo "Usage: $0 {en|cn}" >&2; exit 1 ;;
esac

cd "$(dirname "$0")"
mdbook build ".mdbook/$LANG"
echo "Built $LANG book → $(pwd)/book/$LANG/index.html"
