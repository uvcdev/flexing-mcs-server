#!/bin/bash

SCRIPT_PATH="./src/scripts/getNodesFromKepware.ts"

echo "🔄 Running KepServer sync script..."
npx ts-node "$SCRIPT_PATH"

if [ $? -eq 0 ]; then
  echo "✅ KepServer sync completed successfully!"
else
  echo "❌ KepServer sync failed!"
  exit 1
fi
