#!/bin/bash

# Build the Angular app
echo "Building Angular app..."
npm run build

# Add Android platform if it doesn't exist
if [ ! -d "android" ]; then
  echo "Adding Android platform..."
  npx cap add android
else
  echo "Android platform already exists."
fi

# Copy web assets to Android project
echo "Copying web assets to Android..."
npx cap copy android

# Update native dependencies
echo "Updating native dependencies..."
npx cap update android

# Open Android Studio (optional)
read -p "Do you want to open Android Studio? (y/n) " OPEN_STUDIO
if [[ $OPEN_STUDIO =~ ^[Yy]$ ]]; then
  echo "Opening Android Studio..."
  npx cap open android
fi

echo "Build completed successfully."
