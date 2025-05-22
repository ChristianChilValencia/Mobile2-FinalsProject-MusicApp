#!/bin/bash

# Setup Deezer API Integration Script
echo "Setting up Deezer API Integration..."

# Check if the RapidAPI key is valid
echo "Testing Deezer API connection..."

# Use curl to make a test request to the Deezer API
RESPONSE=$(curl -s "https://deezerdevs-deezer.p.rapidapi.com/search?q=test" \
  -H "X-RapidAPI-Key: 22b38b0583msh6ca6120bebde3a8p1a434cjsnfea3a2d94f6d" \
  -H "X-RapidAPI-Host: deezerdevs-deezer.p.rapidapi.com")

# Check if the response contains data
if [[ $RESPONSE == *"data"* ]]; then
  echo "Deezer API connection successful!"
else
  echo "Error: Deezer API connection failed. Please check your API key."
  echo "Response: $RESPONSE"
  exit 1
fi

echo "Deezer API integration is ready to use."
