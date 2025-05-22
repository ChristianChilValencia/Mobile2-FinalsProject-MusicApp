#!/bin/bash

# Initialize Capacitor for Android
echo "Initializing Capacitor for Android..."

# Build the Angular app first
echo "Building Angular app..."
npm run build

# Add Android platform
echo "Adding Android platform..."
npx cap add android

# Install required Capacitor plugins
echo "Installing Capacitor plugins..."
npm install @capacitor/android @capacitor/filesystem @capacitor-community/native-audio @capacitor/splash-screen

# Sync plugins with native project
echo "Syncing plugins with native project..."
npx cap sync android

echo "Android initialization completed successfully."
echo "You can now run 'npm run build:android' to build the app for Android."
