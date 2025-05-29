import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataService } from './data.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Track } from '../models/track.model';

export enum RepeatMode {
  None = 'none',
  One = 'one',
  All = 'all'
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  currentIndex: number;
  isShuffleActive: boolean;
  repeatMode: RepeatMode;
}

@Injectable({ providedIn: 'root' })
export class MediaPlayerService {
  private audioPlayer: HTMLAudioElement;
  private localAudioPlayer: HTMLAudioElement;
  private _savedPosition: number | undefined = undefined;
  private currentTrack$ = new BehaviorSubject<Track | null>(null);
  private isPlaying$ = new BehaviorSubject<boolean>(false);
  private currentTime$ = new BehaviorSubject<number>(0);
  private duration$ = new BehaviorSubject<number>(0);
  private queue: Track[] = [];
  private queueIndex = 0;
  private timerId: any;
  private _currentBlobUrl: string | null = null;
  private _trackReady = false;
  private volume = 1.0;
  private isShuffleActive = false;
  private repeatMode: RepeatMode = RepeatMode.None;

  private playbackState$ = new BehaviorSubject<PlaybackState>({
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    queue: [],
    currentIndex: 0,
    isShuffleActive: false,
    repeatMode: RepeatMode.None
  });

  constructor(
    private dataService: DataService,
    private platform: Platform
  ) {
    this.audioPlayer = new Audio();
    this.localAudioPlayer = new Audio();
    this.configureAudioElement(this.audioPlayer);
    this.configureAudioElement(this.localAudioPlayer);
    this.setupAudioEvents();
  }

  private configureAudioElement(audio: HTMLAudioElement) {
    audio.autoplay = false;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = 1.0;
  }  private setupAudioEvents() {
    this.audioPlayer.addEventListener('loadedmetadata', () => {
      // For streamed songs, cap at 30 seconds
      if (!this.currentTrack$.getValue()?.isLocal) {
        this.duration$.next(30); // Cap at 30 seconds for streamed tracks
      } else {
        this.duration$.next(this.audioPlayer.duration);
      }
      this._trackReady = true;
      this.updatePlaybackState(); // Update state when metadata is loaded
    });

    this.audioPlayer.addEventListener('timeupdate', () => {
      const currentTrack = this.currentTrack$.getValue();
      if (currentTrack && !currentTrack.isLocal && this.audioPlayer.currentTime > 30) {
        // For streamed tracks, enforce 30 second limit
        this.audioPlayer.pause();
        this.isPlaying$.next(false);
        this.currentTime$.next(30);
        this.stopUpdates();
        // Move to next track if available
        this.next();
      } else {
        this.currentTime$.next(this.audioPlayer.currentTime);
        this.updatePlaybackState(); // Update state during playback for smooth progress bar
      }
    });    this.audioPlayer.addEventListener('play', () => {
      this.isPlaying$.next(true);
      this.startUpdates();
    });    this.audioPlayer.addEventListener('pause', () => {
      this.isPlaying$.next(false);
      this.stopUpdates();
      this.updatePlaybackState(); // Update state when paused
    });

    this.audioPlayer.addEventListener('ended', async () => {
      // Refresh recently played list when track ends
      const currentTrack = this.currentTrack$.value;
      if (currentTrack) {
        try {
          await this.dataService.refreshRecentlyPlayed();
        } catch (error) {
          console.error('Error refreshing history on track end:', error);
        }
      }
      this.next();
    });
    
    this.localAudioPlayer.addEventListener('loadedmetadata', () => {
      // For local files, use the actual duration
      this.duration$.next(this.localAudioPlayer.duration);
      this._trackReady = true;
      this.updatePlaybackState(); // Update state when metadata is loaded
    });

    this.localAudioPlayer.addEventListener('timeupdate', () => {
      this.currentTime$.next(this.localAudioPlayer.currentTime);
      this.updatePlaybackState(); // Update state during playback for smooth progress bar
    });

    this.localAudioPlayer.addEventListener('play', () => {
      this.isPlaying$.next(true);
      this.startUpdates();
    });    this.localAudioPlayer.addEventListener('pause', () => {
      this.isPlaying$.next(false);
      this.stopUpdates();
    });

    this.localAudioPlayer.addEventListener('ended', async () => {
      // Refresh recently played list when track ends
      const currentTrack = this.currentTrack$.value;
      if (currentTrack) {
        try {
          await this.dataService.refreshRecentlyPlayed();
        } catch (error) {
          console.error('Error refreshing history on track end:', error);
        }
      }
      this.next();
    });
  }

  private startUpdates() {
    this.stopUpdates();
    this.timerId = setInterval(() => {
      const activePlayer = this.getCurrentPlayer();
      this.currentTime$.next(activePlayer.currentTime);
    }, 500);
  }

  private stopUpdates() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private getCurrentPlayer(): HTMLAudioElement {
    const track = this.currentTrack$.getValue();
    return track?.isLocal ? this.localAudioPlayer : this.audioPlayer;
  }  async play(track?: Track): Promise<void> {
    if (!track) {
      // Resume current track
      const currentTrack = this.currentTrack$.value;
      if (!currentTrack) {
        throw new Error('No track to play');
      }
      return this.resume();
    }
    
    this.cleanup();
    this.currentTrack$.next(track);
    this.updatePlaybackState(); // Update state when track changes

    try {
      // Update lastPlayed timestamp
      const now = new Date().toISOString();
      
      // Ensure track has all required fields
      const trackToSave: Track = {
        ...track,
        source: track.id.startsWith('deezer-') ? 'stream' as const : 'local' as const,
        addedAt: track.addedAt || now,
        lastPlayed: now,
        artwork: track.artwork || track.imageUrl || 'assets/placeholder-album.png',
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist'
      };

      // Ensure track is in collection first
      const allTracks = await this.dataService.getAllTracks();
      const existingTrack = allTracks.find(t => t.id === track.id);
      
      let tracksToSave: Track[];
      if (existingTrack) {
        // Update existing track
        tracksToSave = allTracks.map(t => 
          t.id === track.id ? {
            ...t,
            ...trackToSave // Keep all new track data
          } : t
        );
      } else {
        // Add new track
        tracksToSave = [...allTracks, trackToSave];
      }
      
      // Save tracks first and wait for it to complete
      await this.dataService.saveTracks(tracksToSave);
      
      // Verify track was saved by fetching fresh data
      const verifyTracks = await this.dataService.getAllTracks();
      const verifyTrack = verifyTracks.find(t => t.id === track.id);
      
      if (!verifyTrack) {
        console.error(`Failed to save track ${track.id} to collection`);
        // Continue anyway, but log the error
      } else {
        console.log(`Successfully saved track ${track.id} to collection`);
        
        // Then add to recently played history
        try {
          await this.dataService.addToRecentlyPlayed(track.id);
        } catch (error) {
          console.error('Error updating track history:', error);
          // Continue playing even if history fails
        }
      }
    } catch (error) {
      console.error('Error updating track data:', error);
      // Continue playing even if data update fails
    }

    try {
      if (track.isLocal) {
        const player = this.localAudioPlayer;

        if (Capacitor.isNativePlatform()) {
          const audioSrc = Capacitor.convertFileSrc(track.previewUrl);
          player.src = audioSrc;
          player.load();
          try {
            await player.play();
            this.isPlaying$.next(true);
            this.startUpdates();
          } catch (playError) {
            throw playError;
          }
        } else {
          player.src = track.previewUrl;
          player.load();
          try {
            await player.play();
            this.isPlaying$.next(true);
            this.startUpdates();
          } catch (playError) {
            throw playError;
          }
        }
      } else {
        const player = this.audioPlayer;
        player.src = track.previewUrl;
        player.load();
        try {
          await player.play();
          this.isPlaying$.next(true);
          this.startUpdates();
        } catch (playError) {
          throw playError;
        }
      }

      await this.dataService.set('last_played_track', track);
    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  }

  private base64ToBlob(data: string | ArrayBuffer, mimeType: string): Blob {
    let base64String: string;
    if (typeof data === 'string') {
      base64String = data;
    } else {
      base64String = this.arrayBufferToBase64(data);
    }

    const byteCharacters = atob(base64String);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: mimeType });
  }

  async pause(): Promise<void> {
    try {
      const activePlayer = this.getCurrentPlayer();
      this._savedPosition = activePlayer.currentTime;
      activePlayer.pause();
      this.isPlaying$.next(false);
    } catch (error) {
      throw error;
    }
  }

  async resume(position?: number): Promise<void> {
    try {
      const track = this.currentTrack$.getValue();
      if (!track) {
        throw new Error('No track selected to resume');
      }
      const activePlayer = this.getCurrentPlayer();
      if (position !== undefined && !isNaN(position)) {
        activePlayer.currentTime = position;
      }
      else if (this._savedPosition !== undefined && !isNaN(this._savedPosition)) {
        activePlayer.currentTime = this._savedPosition;
      }

      try {
        await activePlayer.play();
        this.isPlaying$.next(true);
        this.startUpdates();
      } catch (playError) {
        throw playError;
      }
    } catch (error) {
      console.error('Error in resume:', error);
      throw error;
    }
  }

  async togglePlay(): Promise<void> {
    try {
      const isPlaying = this.isPlaying$.getValue();
      const track = this.currentTrack$.getValue();

      if (!track) {
        throw new Error('No track selected to play');
      }

      if (isPlaying) {
        await this.pause();
      } else {
        await this.resume();
      }
    } catch (error) {
      console.error('Error in togglePlay:', error);
      this.isPlaying$.next(false);
      throw error;
    }  }
  async next(): Promise<void> {
    this.cleanup();
    if (!this.queue.length) return;
    this.queueIndex = (this.queueIndex + 1) % this.queue.length;
    
    // Get the next track
    const nextTrack = this.queue[this.queueIndex];
    
    // Add the next track to recently played BEFORE playing
    try {
      await this.dataService.addToRecentlyPlayed(nextTrack.id);
    } catch (error) {
      console.error('Error adding track to history during next():', error);
    }
    
    // Then play the track
    await this.play(nextTrack);
  }
  async previous(): Promise<void> {
    this.cleanup();
    if (!this.queue.length) return;

    const activePlayer = this.getCurrentPlayer();
    
    if (activePlayer.currentTime > 3) {
      activePlayer.currentTime = 0;
    } else {
      this.queueIndex = (this.queueIndex - 1 + this.queue.length) % this.queue.length;
      
      // Get the previous track
      const prevTrack = this.queue[this.queueIndex];
      
      // Add the previous track to recently played BEFORE playing
      try {
        await this.dataService.addToRecentlyPlayed(prevTrack.id);
      } catch (error) {
        console.error('Error adding track to history during previous():', error);
      }
      
      // Then play the track
      await this.play(prevTrack);
    }
  }

  seek(time: number): void {
    const activePlayer = this.getCurrentPlayer();
    activePlayer.currentTime = time;
    this._savedPosition = time;
  }

  cleanup(): void {
    this.audioPlayer.pause();
    this.localAudioPlayer.pause();
    this.audioPlayer.currentTime = 0;
    this.localAudioPlayer.currentTime = 0;
    if (this._currentBlobUrl) {
      URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = null;
    }
    this._savedPosition = undefined;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  async addLocalTrack(file: File): Promise<Track> {
    try {      // Validate file
      const validTypes = [
        'audio/mpeg', 'audio/mp3',  // MP3
        'audio/wav', 'audio/x-wav',  // WAV
        'audio/ogg', 'audio/vorbis',  // OGG
        'audio/aac', 'audio/x-m4a', 'audio/mp4', 'audio/m4a',  // AAC/M4A
        'audio/flac', 'audio/x-flac',  // FLAC
        'audio/opus'  // OPUS
      ];
      // Check if the MIME type or its variants are supported
      const isValidType = validTypes.some(type => file.type.toLowerCase() === type.toLowerCase());
      if (!isValidType) {
        console.warn(`Attempting to handle file type: ${file.type}`);
        // Try to validate by extension as fallback
        const ext = file.name.split('.').pop()?.toLowerCase();
        const validExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'];
        if (!ext || !validExtensions.includes(ext)) {
          throw new Error(`Invalid file type: ${file.type}. Supported types: MP3, WAV, OGG, AAC, FLAC, OPUS, M4A`);
        }
      }

      // Check file size (max 50MB)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds 50MB limit: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      }

      const trackId = `local-${Date.now()}`;
      const inputFileName = file.name;
      const trackFileExt = inputFileName.split('.').pop()?.toLowerCase() || 'mp3';
      const newFileName = `${trackId}.${trackFileExt}`;
      const trackFilePath = `music/${newFileName}`;
      let trackUri = '';

      if (this.platform.is('hybrid')) {
        // Convert file to base64
        let fileArrayBuffer: ArrayBuffer;
        try {
          fileArrayBuffer = await file.arrayBuffer();
        } catch (error) {
          console.error('Error reading file:', error);
          throw new Error('Failed to read audio file. Please try again.');
        }
        
        let base64Data: string;
        try {
          base64Data = this.arrayBufferToBase64(fileArrayBuffer);
        } catch (error) {
          console.error('Error converting file to base64:', error);
          throw new Error('Failed to process audio file. Please try again.');
        }

        try {
          // Ensure music directory exists
          await Filesystem.mkdir({
            path: 'music',
            directory: Directory.Data,
            recursive: true
          });
        } catch (error) {
          // Ignore if directory already exists
          const err = error as { message?: string };
          if (err.message && !err.message.includes('exists')) {
            console.error('Error creating music directory:', error);
            throw new Error('Failed to create storage directory. Please check app permissions.');
          }
        }

        // Save file
        try {
          const savedFile = await Filesystem.writeFile({
            path: trackFilePath,
            data: base64Data,
            directory: Directory.Data
          });
          trackUri = savedFile.uri;
        } catch (error) {
          const err = error as { message?: string };
          throw new Error(`Failed to write file: ${err.message || 'Unknown error'}`);
        }
      } else {
        // Web platform - use blob URLs
        trackUri = URL.createObjectURL(file);
      }

      // Extract metadata and title from filename
      let rawTitle = inputFileName.replace(/\.[^/.]+$/, '');
      // Remove common prefixes/numbers
      rawTitle = rawTitle.replace(/^\d+[\s.-]+/, '').trim();
      // Try to extract artist if format is "Artist - Title"
      let trackArtist = 'Unknown Artist';
      let trackTitle = rawTitle;
      if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        trackArtist = parts[0].trim();
        trackTitle = parts[1].trim();
      }      // Create track object
      const trackDuration = await this.getAudioDuration(file);
      const track: Track = {
        id: trackId,
        title: trackTitle,
        artist: trackArtist,
        album: trackArtist !== 'Unknown Artist' ? trackArtist : 'Local Music',
        duration: trackDuration,
        imageUrl: 'assets/placeholder-album.png',
        previewUrl: trackUri,
        spotifyId: '',
        liked: false,
        isLocal: true,
        localPath: trackFilePath,
        source: 'local',
        addedAt: new Date().toISOString(),
        type: trackFileExt,
        artwork: 'assets/placeholder-album.png',
        pathOrUrl: trackUri
      };

      // Save track metadata
      await this.dataService.saveLocalMusic(track, trackFilePath);
      return track;

    } catch (error) {
      console.error('Error adding local track:', error);
      throw error;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  async getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const tempAudio = new Audio();
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(0);
      }, 3000);

      tempAudio.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        const duration = isNaN(tempAudio.duration) ? 0 : tempAudio.duration;
        URL.revokeObjectURL(url);
        resolve(duration);
      });

      tempAudio.addEventListener('error', () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(0);
      });

      tempAudio.preload = 'metadata';
      tempAudio.src = url;
    });  }
  async setQueue(tracks: Track[], startIndex = 0): Promise<void> {
    console.log(`Setting queue with ${tracks.length} tracks, starting at index ${startIndex}`);
    this.queue = tracks;
    this.queueIndex = startIndex;
    
    if (tracks.length) {
      // Ensure the starting track is added to recently played BEFORE playing
      if (startIndex >= 0 && startIndex < tracks.length) {
        try {
          await this.dataService.addToRecentlyPlayed(tracks[startIndex].id);
        } catch (error) {
          console.error('Error adding track to history during setQueue:', error);
        }
      }
      
      // Then play the track
      await this.play(tracks[startIndex]);
    }
  }

  async clearCurrentTrack(): Promise<void> {
    try {      await this.pause();
      this.currentTrack$.next(null);
      this.isPlaying$.next(false);
      this.currentTime$.next(0);
      this.duration$.next(0);
      this.updatePlaybackState();
      this.audioPlayer.src = '';
      this.audioPlayer.currentTime = 0;
      this.localAudioPlayer.src = '';
      this.localAudioPlayer.currentTime = 0;
      this._savedPosition = undefined;
      await this.dataService.set('last_played_track', null);
    } catch (error) {
      console.error('Error clearing current track:', error);
    }
  }

  // Playback state management
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.audioPlayer.volume = this.volume;
    this.localAudioPlayer.volume = this.volume;
    this.updatePlaybackState();
  }

  setShuffle(isActive: boolean): void {
    this.isShuffleActive = isActive;
    this.updatePlaybackState();
  }

  setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode;
    this.updatePlaybackState();
  }

  private updatePlaybackState(): void {
    this.playbackState$.next({
      isPlaying: this.isPlaying$.value,
      currentTrack: this.currentTrack$.value,
      currentTime: this.currentTime$.value,
      duration: this.duration$.value,
      volume: this.volume,
      queue: this.queue,
      currentIndex: this.queueIndex,
      isShuffleActive: this.isShuffleActive,
      repeatMode: this.repeatMode
    });
  }

  // GETTERS FOR OBSERVABLE DATA
  getCurrentTrack(): Observable<Track|null> { return this.currentTrack$.asObservable(); }
  getIsPlaying(): Observable<boolean> { return this.isPlaying$.asObservable(); }
  getCurrentTime(): Observable<number> { return this.currentTime$.asObservable(); }
  getDuration(): Observable<number> { return this.duration$.asObservable(); }
  getPlaybackState(): Observable<PlaybackState> { return this.playbackState$.asObservable(); }

  // Need to update state after any changes
  private handleStateChange(): void {
    this.updatePlaybackState();
  }
}