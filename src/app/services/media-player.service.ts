import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Track, PlaybackState } from '../models/track.model';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs';
import { NativeAudio } from '@capacitor-community/native-audio';
import { DataService } from './data.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class MediaPlayerService {
  private audio: HTMLAudioElement | null = null;
  private queue: Track[] = [];
  private currentIndex = -1;
  private volume = 1.0;
  private isNative = false;
  private currentTrackId: string | null = null;

  // Observable state
  private playbackStateSubject = new BehaviorSubject<PlaybackState>({
    isPlaying: false,
    currentTrack: null,
    queue: [],
    currentIndex: -1,
    duration: 0,
    currentTime: 0,
    volume: 1.0
  });
  
  playbackState$ = this.playbackStateSubject.asObservable();

  constructor(private platform: Platform, private dataService: DataService) {
    this.initializeAudio();
    
    // Update playback state regularly
    setInterval(() => {
      if (this.audio && !this.isNative) {
        this.updatePlaybackState({
          currentTime: this.audio.currentTime,
          duration: this.audio.duration || 0
        });
      }
    }, 500);
  }

  private initializeAudio(): void {
    // Check if we should use native audio
    this.isNative = this.platform.is('android') || this.platform.is('ios');
    
    if (!this.isNative) {
      this.audio = new Audio();
      this.setupAudioEvents();
    }
  }

  async play(track?: Track): Promise<void> {
    try {
      if (track) {
        // If a track is provided, play that specific track
        await this.loadAndPlayTrack(track);
      } else if (this.currentTrackId) {
        // Otherwise continue with current track if available
        if (this.isNative) {
          await NativeAudio.play({ assetId: this.currentTrackId });
        } else if (this.audio) {
          await this.audio.play();
        }
        
        this.updatePlaybackState({ isPlaying: true });
      }
      
      // Setup media session API for web and mobile
      if ('mediaSession' in navigator) {
        const track = this.queue[this.currentIndex];
        if (track) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: track.album || '',
            artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
          });
          
          navigator.mediaSession.setActionHandler('play', () => this.play());
          navigator.mediaSession.setActionHandler('pause', () => this.pause());
          navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
          navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) {
              this.seek(details.seekTime);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  }

  pause(): void {
    if (this.isNative && this.currentTrackId) {
      NativeAudio.pause({ assetId: this.currentTrackId });
    } else if (this.audio) {
      this.audio.pause();
    }
    
    this.updatePlaybackState({ isPlaying: false });
  }

  togglePlay(): void {
    const currentState = this.playbackStateSubject.value;
    if (currentState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(position: number): void {
    if (this.isNative && this.currentTrackId) {
      // Native audio doesn't support seeking directly
      // We would need a more complex implementation with plugin-specific features
      console.warn('Seeking not fully supported in native audio');
    } else if (this.audio) {
      this.audio.currentTime = position;
      this.updatePlaybackState({ currentTime: position });
    }
  }

  async next(): Promise<void> {
    if (this.queue.length === 0 || this.currentIndex >= this.queue.length - 1) {
      return; // No next track available
    }
    
    this.currentIndex++;
    await this.play(this.queue[this.currentIndex]);
  }

  async previous(): Promise<void> {
    if (this.queue.length === 0 || this.currentIndex <= 0) {
      return; // No previous track available
    }
    
    this.currentIndex--;
    await this.play(this.queue[this.currentIndex]);
  }

  setVolume(level: number): void {
    this.volume = Math.min(1, Math.max(0, level));
    
    if (this.isNative && this.currentTrackId) {
      NativeAudio.setVolume({ assetId: this.currentTrackId, volume: this.volume });
    } else if (this.audio) {
      this.audio.volume = this.volume;
    }
    
    this.updatePlaybackState({ volume: this.volume });
  }

  setQueue(tracks: Track[], startIndex = 0): void {
    this.queue = [...tracks];
    this.currentIndex = Math.min(startIndex, tracks.length - 1);
    
    // Update the observable state
    this.updatePlaybackState({
      queue: this.queue,
      currentIndex: this.currentIndex,
      currentTrack: this.currentIndex >= 0 ? this.queue[this.currentIndex] : null
    });
    
    // Start playing the selected track if valid
    if (this.currentIndex >= 0 && this.queue[this.currentIndex]) {
      this.play(this.queue[this.currentIndex]);
    }
  }

  setupAudioEvents(): void {
    if (!this.audio) return;
    
    // Handle playback events
    this.audio.addEventListener('play', () => {
      this.updatePlaybackState({ isPlaying: true });
    });
    
    this.audio.addEventListener('pause', () => {
      this.updatePlaybackState({ isPlaying: false });
    });
    
    this.audio.addEventListener('ended', () => {
      this.updatePlaybackState({ isPlaying: false });
      this.next(); // Auto-play next track
    });
    
    this.audio.addEventListener('timeupdate', () => {
      this.updatePlaybackState({
        currentTime: this.audio?.currentTime || 0
      });
    });
    
    this.audio.addEventListener('durationchange', () => {
      this.updatePlaybackState({
        duration: this.audio?.duration || 0
      });
    });
    
    this.audio.addEventListener('volumechange', () => {
      this.updatePlaybackState({
        volume: this.audio?.volume || 1.0
      });
    });
    
    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.updatePlaybackState({ isPlaying: false });
    });
  }

  private async loadAndPlayTrack(track: Track): Promise<void> {
    try {
      // Stop any current playback
      if (this.isNative && this.currentTrackId) {
        try {
          await NativeAudio.stop({ assetId: this.currentTrackId });
          await NativeAudio.unload({ assetId: this.currentTrackId });
        } catch (e) {
          // Ignore errors from stopping/unloading, might not be loaded yet
        }
      } else if (this.audio) {
        this.audio.pause();
        this.audio.src = '';
      }
      
      this.currentTrackId = track.id;
      
      if (this.isNative) {
        // For local files, use native audio for better performance
        if (track.source === 'local') {
          await NativeAudio.preload({
            assetId: track.id,
            assetPath: track.pathOrUrl,
            audioChannelNum: 1,
            isUrl: false
          });
        } else {
          // For streaming, we need to use the URL
          await NativeAudio.preload({
            assetId: track.id,
            assetPath: track.pathOrUrl,
            audioChannelNum: 1,
            isUrl: true
          });
        }
        
        await NativeAudio.setVolume({ assetId: track.id, volume: this.volume });
        await NativeAudio.play({ assetId: track.id });
        
        // For native audio, we need to manually handle the duration
        this.updatePlaybackState({
          isPlaying: true,
          currentTrack: track,
          currentTime: 0,
          duration: track.duration
        });
      } else {
        // For web audio
        if (!this.audio) {
          this.audio = new Audio();
          this.setupAudioEvents();
        }
        
        this.audio.src = track.pathOrUrl;
        this.audio.volume = this.volume;
        await this.audio.play();
        
        this.updatePlaybackState({
          isPlaying: true,
          currentTrack: track,
          currentTime: 0,
          duration: track.duration || 0
        });
      }
      
      // Update current track in state
      this.updatePlaybackState({
        currentTrack: track,
        isPlaying: true
      });
    } catch (error) {
      console.error('Error loading and playing track:', error);
      throw error;
    }
  }
  private updatePlaybackState(update: Partial<PlaybackState>): void {
    const currentState = this.playbackStateSubject.value;
    this.playbackStateSubject.next({
      ...currentState,
      ...update
    });
  }

  // Add these methods
  setShuffle(isOn: boolean): void {
    // Implement shuffle logic here
    console.log(`Shuffle set to ${isOn}`);
    // If shuffle is on, you might want to randomize the queue order
    // but keep the current track at the current index
  }

  setRepeatMode(mode: 'off' | 'all' | 'one'): void {
    // Implement repeat mode logic here
    console.log(`Repeat mode set to ${mode}`);
    // This will be used in the 'ended' event handler to determine
    // what to do when a track finishes playing
  }
}
