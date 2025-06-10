#!/bin/bash

SCRIPT_PATH="./src/scripts/updateSubscription.ts"

echo "🔄 Updating subscription settings..."
npx ts-node "$SCRIPT_PATH"

if [ $? -eq 0 ]; then
  echo "✅ Subscription update completed!"
else
  echo "❌ Subscription update failed!"
  exit 1
fi
