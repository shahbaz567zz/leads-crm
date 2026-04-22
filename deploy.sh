#!/bin/bash
set -e

echo "🚀 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm ci

echo "🏗️ Building app..."
npm run build

echo "♻️ Reloading PM2 (zero downtime)..."
pm2 reload ecosystem.config.js

echo "✅ Deploy complete!"