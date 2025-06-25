#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# 1. Clean the dist directory
echo "Cleaning dist directory..."
rm -rf dist
mkdir dist

# 2. Compile TypeScript
echo "Compiling TypeScript..."
npx tsc

# 3. Copy all necessary assets
echo "Copying assets..."
cp sidebar.html dist/
cp app.html dist/
cp style.css dist/
cp tab-manager.css dist/
cp manifest.json dist/
cp -r images dist/

echo "Build complete!"