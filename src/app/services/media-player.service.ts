import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataService } from './data.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Track } from './data.service';

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

    this.currentTrack$.subscribe(() => this.updatePlaybackState());
    this.isPlaying$.subscribe(() => this.updatePlaybackState());
    this.currentTime$.subscribe(() => this.updatePlaybackState());
    this.duration$.subscribe(() => this.updatePlaybackState());
  }

  private configureAudioElement(audio: HTMLAudioElement) {
    audio.autoplay = false;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = this.volume;
  }  
  
  private setupAudioEvents() {
    [this.audioPlayer, this.localAudioPlayer].forEach(player => {
      player.addEventListener('loadedmetadata', () => {
        const isStreamedTrack = player === this.audioPlayer && !this.currentTrack$.getValue()?.isLocal;
        this.duration$.next(isStreamedTrack ? 30 : player.duration);
        this.updatePlaybackState();
      });

      player.addEventListener('timeupdate', () => {
        const currentTrack = this.currentTrack$.getValue();
        const isStreamedTrack = player === this.audioPlayer && !currentTrack?.isLocal;
        
        if (isStreamedTrack && player.currentTime > 30) {
          player.pause();
          this.isPlaying$.next(false);
          this.currentTime$.next(30);
          this.stopUpdates();
          this.next();
        } else {
          this.currentTime$.next(player.currentTime);
          this.updatePlaybackState();
        }
      });

      player.addEventListener('play', () => {
        this.isPlaying$.next(true);
        this.updatePlaybackState();
      });

      player.addEventListener('pause', () => {
        this.isPlaying$.next(false);
        this.stopUpdates();
        this.updatePlaybackState();
      });

      player.addEventListener('ended', async () => {
        const currentTrack = this.currentTrack$.getValue();
        if (currentTrack) {
          if (this.repeatMode === RepeatMode.One && currentTrack) {
            await this.play(currentTrack);
          } else if (this.repeatMode === RepeatMode.All || this.queue.length > 0) {
            await this.next();
          } else {
            this.cleanup();
            this.updatePlaybackState();
          }
        }
      });

      player.addEventListener('error', (e) => {
        console.error('Audio player error:', e);
        this.cleanup();
        this.updatePlaybackState();
      });
    });
  }

  private stopUpdates() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      this.updatePlaybackState();
    }
  }

  private getCurrentPlayer(): HTMLAudioElement {
    const track = this.currentTrack$.getValue();
    return track?.isLocal ? this.localAudioPlayer : this.audioPlayer;
  }  
  
  async play(track?: Track): Promise<void> {
    try {
      if (!track) {
        const currentTrack = this.currentTrack$.value;
        if (!currentTrack) {
          throw new Error('No track to play');
        }
        return this.resume();
      }
      
      this.cleanup();
      this.currentTrack$.next(track);
      this.updatePlaybackState();

      const now = new Date().toISOString();
      const trackToSave: Track = {
        ...track,
        source: track.id.startsWith('deezer-') ? 'stream' as const : 'local' as const,
        addedAt: track.addedAt || now,
        lastPlayed: now,
        artwork: track.artwork || track.imageUrl || 'assets/placeholder-player.png',
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist'
      };      try {
        await this.dataService.saveTracks([trackToSave]);
      } catch (error) {
        console.error('Error saving track metadata:', error);
      }

      const player = track.isLocal ? this.localAudioPlayer : this.audioPlayer;
      const audioSrc = this.platform.is('hybrid') ? 
        Capacitor.convertFileSrc(track.previewUrl) : 
        track.previewUrl;

      try {
        console.log(`Playing ${track.isLocal ? 'local' : 'streaming'} file:`, audioSrc);
        player.src = audioSrc;
        player.load();
        await player.play();
        
        this.isPlaying$.next(true);
        await this.dataService.set('last_played_track', track);
      } catch (error) {
        console.error('Error playing track:', error);
        this.cleanup();
        throw error;
      }
    } catch (error) {
      console.error('Error in play method:', error);
      this.cleanup();
      throw error;
    }
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

  async next(): Promise<void> {
    this.cleanup();
    if (!this.queue.length) return;
    this.queueIndex = (this.queueIndex + 1) % this.queue.length;
    
    const nextTrack = this.queue[this.queueIndex];
    
    await this.play(nextTrack);
  }

  seek(time: number): void {
    const activePlayer = this.getCurrentPlayer();
    activePlayer.currentTime = time;
    this._savedPosition = time;
  }

  cleanup(): void {
    this.stopUpdates();
    [this.audioPlayer, this.localAudioPlayer].forEach(player => {
      player.pause();
      player.currentTime = 0;
    });
    
    if (this._currentBlobUrl) {
      URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = null;
    }
    
    this._savedPosition = undefined;
    this.updatePlaybackState();
  }

  async addLocalTrack(file: File): Promise<Track> {
    try {
      const validTypes = [
        'audio/mpeg', 
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/ogg',
        'audio/vorbis',
        'audio/aac',
        'audio/x-m4a',
        'audio/mp4',
        'audio/m4a',
        'audio/flac',
        'audio/x-flac',
        'audio/opus'
      ];
      const isValidType = validTypes.some(type => file.type.toLowerCase() === type.toLowerCase());
      if (!isValidType) {
        console.warn(`Attempting to handle file type: ${file.type}`);
        const ext = file.name.split('.').pop()?.toLowerCase();
        const validExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'];
        if (!ext || !validExtensions.includes(ext)) {
          throw new Error(`Invalid file type: ${file.type}. Supported types: MP3, WAV, OGG, AAC, FLAC, OPUS, M4A`);
        }
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024; 
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
          await Filesystem.mkdir({
            path: 'music',
            directory: Directory.Data,
            recursive: true
          });
        } catch (error) {
          const err = error as { message?: string };
          if (err.message && !err.message.includes('exists')) {
            console.error('Error creating music directory:', error);
            throw new Error('Failed to create storage directory. Please check app permissions.');
          }
        }

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
        trackUri = URL.createObjectURL(file);
      }

      let rawTitle = inputFileName.replace(/\.[^/.]+$/, '');
      rawTitle = rawTitle.replace(/^\d+[\s.-]+/, '').trim();
      let trackArtist = 'Unknown Artist';
      let trackTitle = rawTitle;
      if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        trackArtist = parts[0].trim();
        trackTitle = parts[1].trim();
      }
      const trackDuration = await this.getAudioDuration(file);
      const track: Track = {
        id: trackId,
        title: trackTitle,
        artist: trackArtist,
        album: trackArtist !== 'Unknown Artist' ? trackArtist : 'Local Music',
        duration: trackDuration,
        imageUrl: 'assets/placeholder-player.png',
        previewUrl: trackUri,
        isLocal: true,
        localPath: trackFilePath,
        source: 'local',
        addedAt: new Date().toISOString(),
        type: trackFileExt,
        artwork: 'assets/placeholder-player.png',
        pathOrUrl: trackUri
      };
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
    });  
  }  
    
  async setQueue(tracks: Track[], startIndex = 0): Promise<void> {
    console.log(`Setting queue with ${tracks.length} tracks, starting at index ${startIndex}`);
    this.queue = tracks;
    this.queueIndex = startIndex;
    
    if (tracks.length) {
      try {
        console.log('Playing track from queue:', tracks[startIndex]);
        await this.play(tracks[startIndex]);
      } catch (error) {
        console.error('Failed to play track from queue:', error);
        throw error;
      }
    }
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

  getCurrentTrack(): Observable<Track|null> { return this.currentTrack$.asObservable(); }
  getIsPlaying(): Observable<boolean> { return this.isPlaying$.asObservable(); }
  getCurrentTime(): Observable<number> { return this.currentTime$.asObservable(); }
  getDuration(): Observable<number> { return this.duration$.asObservable(); }
  getPlaybackState(): Observable<PlaybackState> { return this.playbackState$.asObservable(); }

  isCurrentlyPlaying(track: Track): boolean {
    const state = this.playbackState$.getValue();
    return (
      state.isPlaying && 
      state.currentTrack?.id === track.id
    );
  }
  
  async togglePlayTrack(track: Track): Promise<void> {
    const currentState = this.playbackState$.getValue();
    if (currentState.currentTrack?.id === track.id) {
      this.togglePlay();
    } else {
      await this.play(track);
    }
  }
}