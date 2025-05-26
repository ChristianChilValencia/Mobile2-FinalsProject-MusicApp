import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataService } from './data.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  previewUrl: string;
  spotifyId: string;
  liked: boolean;
  isLocal: boolean;
  localPath?: string;
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
  }

  private setupAudioEvents() {
    this.audioPlayer.addEventListener('loadedmetadata', () => {
      this.duration$.next(this.audioPlayer.duration);
      this._trackReady = true;
    });

    this.audioPlayer.addEventListener('timeupdate', () => {
      this.currentTime$.next(this.audioPlayer.currentTime);
    });

    this.audioPlayer.addEventListener('play', () => {
      this.isPlaying$.next(true);
      this.startUpdates();
    });

    this.audioPlayer.addEventListener('pause', () => {
      this.isPlaying$.next(false);
      this.stopUpdates();
    });

    this.audioPlayer.addEventListener('ended', () => {
      this.next();
    });

    this.localAudioPlayer.addEventListener('loadedmetadata', () => {
      this.duration$.next(this.localAudioPlayer.duration);
      this._trackReady = true;
    });

    this.localAudioPlayer.addEventListener('timeupdate', () => {
      this.currentTime$.next(this.localAudioPlayer.currentTime);
    });

    this.localAudioPlayer.addEventListener('play', () => {
      this.isPlaying$.next(true);
      this.startUpdates();
    });

    this.localAudioPlayer.addEventListener('pause', () => {
      this.isPlaying$.next(false);
      this.stopUpdates();
    });

    this.localAudioPlayer.addEventListener('ended', () => {
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
  }

  async play(track: Track): Promise<void> {
    this.cleanup();
    this.currentTrack$.next(track);

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
          try {
            const fileData = await Filesystem.readFile({
              path: track.previewUrl.replace('file://', ''),
              directory: Directory.Data,
            });

            if (fileData.data) {
              let blob: Blob;
              if (fileData.data instanceof Blob) {
                blob = fileData.data;
              } else {
                blob = this.base64ToBlob(fileData.data, 'audio/mpeg');
              }
              const url = URL.createObjectURL(blob);
              this._currentBlobUrl = url;
              player.src = url;
              player.load();
              await player.play();
              this.isPlaying$.next(true);
              this.startUpdates();
            } else {
              throw new Error('File data is empty');
            }
          } catch (webPlayError) {
            console.error('Error playing web audio:', webPlayError);
            throw webPlayError;
          }
        }
      } else {
        this.audioPlayer.src = track.previewUrl;
        this.audioPlayer.load();
        await this.audioPlayer.play();
        this.isPlaying$.next(true);
      }
    } catch (e) {
      console.error('Playback failed:', e);
      this.isPlaying$.next(false);
      throw e;
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
    }
  }

  next(): void {
    this.cleanup();
    if (!this.queue.length) return;
    this.queueIndex = (this.queueIndex + 1) % this.queue.length;
    this.play(this.queue[this.queueIndex]);
  }

  previous(): void {
    this.cleanup();
    if (!this.queue.length) return;

    const activePlayer = this.getCurrentPlayer();
    if (activePlayer.currentTime > 3) {
      activePlayer.currentTime = 0;
    } else {
      this.queueIndex = (this.queueIndex - 1 + this.queue.length) % this.queue.length;
      this.play(this.queue[this.queueIndex]);
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
    try {
      // Validate file
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/opus', 'audio/m4a'];
      if (!validTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}. Supported types: MP3, WAV, OGG, AAC, FLAC, OPUS, M4A`);
      }

      // Check file size (max 50MB)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds 50MB limit: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      }

      const id = `local-${Date.now()}`;
      const fileName = file.name;
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'mp3';
      const uniqueFileName = `${id}.${fileExtension}`;
      const relativeFilePath = `music/${uniqueFileName}`;
      let fileUri = '';

      if (this.platform.is('hybrid')) {
        // Convert file to base64
        const fileArrayBuffer = await file.arrayBuffer();
        const base64 = this.arrayBufferToBase64(fileArrayBuffer);

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
            throw error;
          }
        }

        // Save file
        try {
          const savedFile = await Filesystem.writeFile({
            path: relativeFilePath,
            data: base64,
            directory: Directory.Data
          });
          fileUri = savedFile.uri;
        } catch (error) {
          const err = error as { message?: string };
          throw new Error(`Failed to write file: ${err.message || 'Unknown error'}`);
        }
      } else {
        // Web platform - use blob URLs
        fileUri = URL.createObjectURL(file);
      }

      // Extract metadata and title from filename
      let title = fileName.replace(/\.[^/.]+$/, '');
      // Remove common prefixes/numbers
      title = title.replace(/^\d+[\s.-]+/, '').trim();
      // Try to extract artist if format is "Artist - Title"
      let artist = 'Unknown Artist';
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts[1].trim();
      }

      // Create track object
      const duration = await this.getAudioDuration(file);
      const track: Track = {
        id,
        title,
        artist,
        album: artist !== 'Unknown Artist' ? artist : 'Local Music',
        duration,
        imageUrl: 'assets/music-bg.png',
        previewUrl: fileUri,
        spotifyId: '',
        liked: false,
        isLocal: true,
        localPath: relativeFilePath
      };

      // Save track metadata
      await this.dataService.saveLocalMusic(track, relativeFilePath);
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
    });
  }

  setQueue(tracks: Track[], startIndex = 0): void {
    console.log(`Setting queue with ${tracks.length} tracks, starting at index ${startIndex}`);
    this.queue = tracks;
    this.queueIndex = startIndex;
    if (tracks.length) {
      this.play(tracks[startIndex]);
    }
  }

  async toggleLike(track: Track): Promise<void> {
    if (track.liked) {
      await this.dataService.removeLiked(track.id);
    } else {
      await this.dataService.addLiked(track.id);
    }
    track.liked = !track.liked;
  }

  async clearCurrentTrack(): Promise<void> {
    try {
      await this.pause();
      this.currentTrack$.next(null);
      this.isPlaying$.next(false);
      this.currentTime$.next(0);
      this.duration$.next(0);
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

  // GETTERS FOR OBSERVABLE DATA
  getCurrentTrack(): Observable<Track|null> { return this.currentTrack$.asObservable(); }
  getIsPlaying(): Observable<boolean> { return this.isPlaying$.asObservable(); }
  getCurrentTime(): Observable<number> { return this.currentTime$.asObservable(); }
  getDuration(): Observable<number> { return this.duration$.asObservable(); }
}