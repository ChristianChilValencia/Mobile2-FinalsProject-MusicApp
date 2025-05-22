# VibeFlow - Music Player App

VibeFlow is a unified music player app that combines local audio playback and streaming capabilities, built with Ionic Angular and Capacitor.

## Features

- Play local audio files in various formats (.mp3, .m4a, .aac, .wav, .ogg, .flac, .opus)
- Stream music from Deezer via RapidAPI
- Create and manage playlists
- Background playback with media session integration
- Modern UI with responsive design
- Mini-player for persistent playback control

## Project Structure

- **Pages**
  - Home: Recently played, featured content, and playback mode toggle
  - Search: Search for streaming music via Deezer API
  - Library: Browse local music and playlists
  - Local Audio: Upload and manage local audio files
  - Playlist Stream: View and manage tracks in a playlist
  - Player: Full-screen player with playback controls

- **Services**
  - MediaPlayerService: Central audio control logic
  - DataService: Track metadata and local DB management
  - DeezerService: Streaming search API integration
  - StorageService: Capacitor Filesystem operations

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Run the app in development mode:
   ```
   npm start
   ```

3. Build for Android:
   ```
   npm run build:android
   ```

## Completing the Project

To finalize the project:

1. Add proper placeholder images for album and playlist covers
2. Implement a proper metadata extraction library for local audio files
3. Add a background service for continuous playback on Android
4. Implement caching for streamed tracks
5. Add audio visualization features
6. Implement a more robust error handling system
7. Add unit and end-to-end tests

## Technical Notes

- The app uses Capacitor's Filesystem API for local storage
- Deezer API is accessed via RapidAPI
- Media Session API is used for OS-level playback integration
- Capacitor Native Audio plugin handles native audio playback

## License

This project is licensed under the MIT License.
