#!/bin/bash
set -e

echo "=== CLI ==="
(cd cli && npm run check)

echo ""
echo "=== Server ==="
(cd server && npm run check)

echo ""
echo "=== Web ==="
(cd web && npm run check)

echo ""
echo "All checks passed."
