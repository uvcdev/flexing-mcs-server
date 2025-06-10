#!/bin/bash

SCRIPT_PATH="./src/scripts/updateInputType.ts"

echo "🔄 Updating INPUT_TYPE settings..."
npx ts-node "$SCRIPT_PATH"

if [ $? -eq 0 ]; then
  echo "✅ INPUT_TYPE update completed!"
else
  echo "❌ INPUT_TYPE update failed!"
  exit 1
fi
