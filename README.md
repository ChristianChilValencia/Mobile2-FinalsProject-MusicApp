# 🎵 Mobile2 Finals Project - VibeFlow a Music Player App

VibeFlow is a modern, feature-rich music streaming and playback application built with Ionic Angular and Capacitor. It combines the power of online music streaming with local music playback capabilities, offering a seamless music experience.

## ✨ Features

### Core Features
- 🎵 Play local audio files in multiple formats (.mp3, .m4a, .aac, .wav, .ogg, .flac, .opus)
- 🎧 Stream music from Deezer via RapidAPI
- 📑 Create and manage personalized playlists
- 🎼 Background playback with media session integration
- 🎹 Mini-player for persistent playback control
- 💫 Modern, sleek, responsive UI 

### Advanced Features
- 🔍 Search functionality for streaming content
- 📱 Full Android support with native capabilities
- 🎯 Trending music and genre-based exploration
- 💾 Local file management and organization

## 🏗️ Project Structure

### Pages
- **Home**: Trending music and explore sections
- **Search**: Powerful search interface for Deezer streaming content
- **Library**: Browse and manage local music and playlists
- **Uploads (Music)**: Upload and organize local audio files with all music list
- **Playlist (Library)**: Detailed playlist view with track management
- **Player**: Full-screen player with advanced playback controls

### Core Services
- **MediaPlayerService**: Comprehensive audio playback management
  - Dual player system for local and streaming audio
  - Queue management and playback state control
  - Media session integration
  
- **DataService**: Robust data management system
  - SQLite database integration
  - Track metadata management
  - Playlist organization
  
- **DeezerService**: Streaming API integration
  - Music search functionality
  - Trending & Explore tracks retrieval
  - Genre-based recommendations

## 🔧 Technical Details

### Core Technologies
- **Ionic Framework**: UI components and mobile optimization
- **Angular**: Frontend framework and application architecture
- **Capacitor**: Native platform integration
- **SQLite**: Local database management
- **RxJS**: Reactive programming and state management

### Native Features
- **Capacitor Filesystem API**: Local storage management
- **Capacitor Native Audio**: Enhanced audio playback
- **SQLite Storage**: Persistent data management

### API Integration
- **Deezer API via RapidAPI**: Music streaming service
  - Track search
  - 30s Music previews
  - Genre-based recommendations