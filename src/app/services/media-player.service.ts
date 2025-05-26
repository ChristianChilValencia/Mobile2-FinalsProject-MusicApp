import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs';
import { NativeAudio } from '@capacitor-community/native-audio';
import { DataService, Track, PlaybackState, RepeatMode } from './data.service';
import { v4 as uuidv4 } from 'uuid';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class MediaPlayerService {
  private audioPlayer = new Audio();
  private localAudioPlayer = new Audio();
  private queue: Track[] = [];
  private queueIndex = 0;
  private _currentBlobUrl: string | null = null;
  private _savedPosition: number | undefined;
  private volume = 1.0;

  // Observables
  private currentTrack$ = new BehaviorSubject<Track | null>(null);
  private isPlaying$ = new BehaviorSubject<boolean>(false);
  private currentTime$ = new BehaviorSubject<number>(0);
  private duration$ = new BehaviorSubject<number>(0);
  private playbackStateSubject = new BehaviorSubject<PlaybackState>({
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    queue: [],
    currentIndex: -1,
    isShuffleActive: false,
    repeatMode: RepeatMode.None
  });

  playbackState$ = this.playbackStateSubject.asObservable();

  constructor(
    private platform: Platform,
    private dataService: DataService
  ) {
    this.setupAudioEvents();
  }

  private setupAudioEvents(): void {
    [this.audioPlayer, this.localAudioPlayer].forEach(player => {
      player.addEventListener('timeupdate', () => {
        const currentTime = player.currentTime;
        this.currentTime$.next(currentTime);
        this.updatePlaybackState({ currentTime });
      });

      player.addEventListener('durationchange', () => {
        const duration = player.duration;
        this.duration$.next(duration);
        this.updatePlaybackState({ duration });
      });

      player.addEventListener('ended', () => {
        this.isPlaying$.next(false);
        this.updatePlaybackState({ isPlaying: false });
        this.next();
      });

      player.addEventListener('error', (e) => {
        console.error('Audio player error:', e);
        this.isPlaying$.next(false);
        this.updatePlaybackState({ isPlaying: false });
      });
    });
  }

  private getCurrentPlayer(): HTMLAudioElement {
    const currentTrack = this.currentTrack$.getValue();
    return currentTrack?.isLocal ? this.localAudioPlayer : this.audioPlayer;
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
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

  private startUpdates(): void {
    const activePlayer = this.getCurrentPlayer();
    activePlayer.addEventListener('timeupdate', () => {
      const currentTime = activePlayer.currentTime;
      this.currentTime$.next(currentTime);
      this.updatePlaybackState({ currentTime });
    });
  }

  private cleanup(): void {
    if (this._currentBlobUrl) {
      URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = null;
    }
    this.audioPlayer.pause();
    this.localAudioPlayer.pause();
    this.isPlaying$.next(false);
    this.updatePlaybackState({ isPlaying: false });
  }

  async play(track?: Track): Promise<void> {
    if (!track) {
      const currentTrack = this.currentTrack$.getValue();
      if (!currentTrack) {
        throw new Error('No track selected to play');
      }
      return this.resume();
    }

    this.cleanup();
    this.currentTrack$.next(track);
    this.updatePlaybackState({ currentTrack: track });

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
            this.updatePlaybackState({ isPlaying: true });
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
              this.updatePlaybackState({ isPlaying: true });
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
        this.updatePlaybackState({ isPlaying: true });
      }
    } catch (e) {
      console.error('Playback failed:', e);
      this.isPlaying$.next(false);
      this.updatePlaybackState({ isPlaying: false });
      throw e;
    }
  }

  async pause(): Promise<void> {
    try {
      const activePlayer = this.getCurrentPlayer();
      this._savedPosition = activePlayer.currentTime;
      activePlayer.pause();
      this.isPlaying$.next(false);
      this.updatePlaybackState({ isPlaying: false });
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
        this.updatePlaybackState({ currentTime: position });
      }
      else if (this._savedPosition !== undefined && !isNaN(this._savedPosition)) {
        activePlayer.currentTime = this._savedPosition;
        this.updatePlaybackState({ currentTime: this._savedPosition });
      }

      try {
        await activePlayer.play();
        this.isPlaying$.next(true);
        this.updatePlaybackState({ isPlaying: true });
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

  seek(time: number): void {
    const activePlayer = this.getCurrentPlayer();
    activePlayer.currentTime = time;
    this._savedPosition = time;
  }

  // Queue Management
  setQueue(tracks: Track[], startIndex = 0): void {
    console.log(`Setting queue with ${tracks.length} tracks, starting at index ${startIndex}`);
    this.queue = tracks;
    this.queueIndex = startIndex;
    if (tracks.length) {
      this.play(tracks[startIndex]);
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

  // GETTERS FOR OBSERVABLE DATA
  getCurrentTrack(): Observable<Track|null> { return this.currentTrack$.asObservable(); }
  getIsPlaying(): Observable<boolean> { return this.isPlaying$.asObservable(); }
  getCurrentTime(): Observable<number> { return this.currentTime$.asObservable(); }
  getDuration(): Observable<number> { return this.duration$.asObservable(); }

  /**
   * Adds a local track to the library and processes it for playback
   */
  async addLocalTrack(file: File): Promise<Track> {
    try {
      // Validate file type
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/opus', 'audio/m4a'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|aac|flac|opus|m4a)$/i)) {
        throw new Error(`Invalid file type: ${file.type}. Supported types: MP3, WAV, OGG, AAC, FLAC, OPUS, M4A`);
      }

      // Generate unique ID and paths
      const id = `local-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const fileName = file.name;
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'mp3';
      const uniqueFileName = `${id}.${fileExtension}`;
      const relativeFilePath = `music/${uniqueFileName}`;
      let fileUri = '';

      if (this.platform.is('hybrid')) {
        // For mobile platforms
        try {
          await Filesystem.mkdir({
            path: 'music',
            directory: Directory.Data,
            recursive: true
          });
        } catch (error) {
          // Ignore if directory exists
          console.log('Music directory exists or error:', error);
        }

        const fileArrayBuffer = await file.arrayBuffer();
        const base64Data = btoa(
          new Uint8Array(fileArrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        // Save the file
        const savedFile = await Filesystem.writeFile({
          path: relativeFilePath,
          data: base64Data,
          directory: Directory.Data
        });

        fileUri = Capacitor.convertFileSrc(savedFile.uri);
      } else {
        // For web platform
        fileUri = URL.createObjectURL(file);
        this._currentBlobUrl = fileUri;
      }

      // Get audio duration
      let duration = 0;
      try {
        duration = await this.getAudioDuration(file);
      } catch (error) {
        console.warn('Could not get audio duration:', error);
      }

      // Extract metadata from filename
      let title = fileName.replace(/\.[^/.]+$/, '');
      let artist = 'Unknown Artist';
      
      // Try to extract artist if filename is in "Artist - Title" format
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts[1].trim();
      }

      // Create track object with all required properties
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
        localPath: relativeFilePath,
        source: 'local',
        addedAt: new Date().toISOString(),
        type: fileExtension
      };

      // Save track in database
      await this.dataService.saveLocalMusic(track, relativeFilePath);
      
      return track;
    } catch (error) {
      console.error('Error adding local track:', error);
      throw error;
    }
  }

  private async getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('Error loading audio file'));
      audio.src = URL.createObjectURL(file);
    });
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
      this.updatePlaybackState({ currentTrack: null });
    } catch (error) {
      console.error('Error clearing current track:', error);
    }
  }

  setVolume(level: number): void {
    this.volume = Math.min(1, Math.max(0, level));
    const activePlayer = this.getCurrentPlayer();
    activePlayer.volume = this.volume;
    this.updatePlaybackState({ volume: this.volume });
  }

  setShuffle(isActive: boolean): void {
    this.updatePlaybackState({ isShuffleActive: isActive });
  }

  setRepeatMode(mode: RepeatMode): void {
    this.updatePlaybackState({ repeatMode: mode });
  }

  private updatePlaybackState(update: Partial<PlaybackState>): void {
    const currentState = this.playbackStateSubject.value;
    this.playbackStateSubject.next({
      ...currentState,
      ...update
    });
  }
  /**
   * Integrates local track metadata extraction and storage
   * Called from the local-home page
   */
  async integrateLocalMediaService(track: Track): Promise<void> {
    try {
      // Make sure the track has all the necessary properties for the main service
      if (!track.source) track.source = 'local';
      if (!track.addedAt) track.addedAt = new Date().toISOString();
      
      // Make sure the local track is properly registered with the main player service
      await this.dataService.saveLocalMusic(track, track.localPath || '');
      
      // Play the track through the main service
      await this.play(track);
    } catch (error) {
      console.error('Error integrating local track:', error);
      throw error;
    }
  }
}
