import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs';
import { NativeAudio } from '@capacitor-community/native-audio';
import { DataService, Track, PlaybackState, RepeatMode } from './data.service';
import { v4 as uuidv4 } from 'uuid';
import { Filesystem, Directory } from '@capacitor/filesystem';

declare var Media: any;

@Injectable({
  providedIn: 'root'
})
export class MediaPlayerService {
  private audio: HTMLAudioElement | null = null;
  private nativeMedia: any = null; // Cordova Media object
  private queue: Track[] = [];
  private originalQueue: Track[] = [];
  private currentIndex = -1;
  private volume = 1.0;
  private isNative = false;
  private currentTrackId: string | null = null;
  private progressInterval: any = null;
  private audioErrorHandler: ((e: Event) => void) | null = null;

  // Observable state
  private playbackStateSubject = new BehaviorSubject<PlaybackState>({
    isPlaying: false,
    currentTrack: null,
    queue: [],
    currentIndex: -1,
    duration: 0,
    currentTime: 0,
    volume: 1.0,
    repeatMode: RepeatMode.None,
    isShuffleActive: false
  });
  
  playbackState$ = this.playbackStateSubject.asObservable();
  constructor(private platform: Platform, private dataService: DataService) {
    this.initializeAudio();
    
    // Update playback state regularly for web audio
    setInterval(() => {
      if (this.audio && !this.isNative && this.playbackStateSubject.value.isPlaying) {
        const currentTime = Math.min(this.audio.currentTime, 30); // Cap at 30 seconds
        this.updatePlaybackState({
          currentTime: currentTime,
          duration: this.audio.duration || 0
        });
      }
    }, 100); // Update more frequently for smoother progress
  }

  private initializeAudio(): void {
    // Check if we should use native audio
    this.isNative = this.platform.is('android') || this.platform.is('ios');
    
    if (!this.isNative) {
      this.audio = new Audio();
      this.setupAudioEvents();
    }
  }  async play(track?: Track): Promise<void> {
    try {
      if (track) {
        // If a track is provided, play that specific track
        await this.loadAndPlayTrack(track);
      } else if (this.currentTrackId) {
        // Otherwise continue with current track if available
        if (this.isNative) {
          await NativeAudio.play({ assetId: this.currentTrackId });
          // Always restart progress tracking for native audio when playing
          this.startProgressTracking();
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
          navigator.mediaSession.setActionHandler('nexttrack', () => this.next());          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) {
              // Limit seek time to 30 seconds
              const limitedSeekTime = Math.min(details.seekTime, 30);
              this.seek(limitedSeekTime);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  }  pause(): void {
    if (this.isNative && this.currentTrackId) {
      NativeAudio.pause({ assetId: this.currentTrackId });
      // Stop progress tracking when paused
      this.stopProgressTracking();
    } else if (this.audio) {
      this.audio.pause();
    }
    
    // Always update the isPlaying state to false when paused
    this.updatePlaybackState({ isPlaying: false });
  }

  togglePlay(): void {
    const currentState = this.playbackStateSubject.value;
    if (currentState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }  seek(position: number): void {
    // Limit position to 30 seconds
    const limitedPosition = Math.min(position, 30);
      if (this.isNative && this.currentTrackId) {
      if (this.nativeMedia) {
        // Use Cordova Media's seekTo method which is properly supported
        this.nativeMedia.seekTo(limitedPosition * 1000); // Convert to milliseconds
        this.updatePlaybackState({ currentTime: limitedPosition });
      } else {
        // Try to use NativeAudio's seek capabilities where available
        try {
          // NativeAudio doesn't have direct seeking, so we need to restart the track
          // at the desired position if possible
          const trackId = this.currentTrackId; // Store in local variable to avoid null check issues
          NativeAudio.stop({ assetId: trackId })
            .then(() => {
              // Some implementations support starting from a position
              NativeAudio.play({ 
                assetId: trackId,
                time: limitedPosition // Some implementations might support this
              }).catch(() => {
                // If position parameter is not supported, just restart from beginning
                NativeAudio.play({ assetId: trackId });
                console.warn('Seeking with NativeAudio only supported with Cordova Media implementation');
              });
            });
          
          // Update the state to reflect the requested position
          this.updatePlaybackState({ currentTime: limitedPosition });
        } catch (error) {
          console.error('Error seeking in native audio:', error);
        }
      }
    } else if (this.audio) {
      this.audio.currentTime = limitedPosition;
      this.updatePlaybackState({ currentTime: limitedPosition });
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

  /**
   * Load and play a queue of tracks starting at a specific index
   */
  async loadQueue(tracks: Track[], startIndex: number = 0): Promise<void> {
    if (!tracks || tracks.length === 0 || startIndex < 0 || startIndex >= tracks.length) {
      console.error('Invalid queue or index');
      return;
    }
    
    // Set the queue
    this.queue = [...tracks];
    this.currentIndex = startIndex;
    
    // Play the track at the start index
    await this.loadAndPlayTrack(tracks[startIndex]);
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
    
    // Store the error handler so we can remove it later
    this.audioErrorHandler = (e: Event) => {
      console.error('Audio playback error:', e);
      this.updatePlaybackState({ isPlaying: false });
    };
    
    this.audio.addEventListener('error', this.audioErrorHandler);
  }  private async loadAndPlayTrack(track: Track): Promise<void> {
    try {
      if (this.currentIndex === -1) {
        this.currentIndex = 0;
      }

      // Stop current playback if any
      await this.stopCurrentPlayback();

      // Add a small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      if (this.isNative) {
        try {
          // For streaming tracks, use direct URL playback
          if (track.source === 'stream' && track.pathOrUrl) {
            console.log('Attempting native playback of streaming URL:', track.pathOrUrl);
            
            // Use unique ID for the track that includes timestamp to prevent conflicts
            const assetId = `stream-${track.id}-${Date.now()}`;
            this.currentTrackId = assetId;

            // Pre-load the streaming URL
            await NativeAudio.preload({
              assetPath: track.pathOrUrl,
              assetId: assetId,
              isUrl: true,
              volume: this.volume,
              audioChannelNum: 1 // Use mono channel for preview tracks
            });

            // Double check no other audio is playing
            try {
              const oldStreamId = `stream-${track.id}`;
              await NativeAudio.stop({ assetId: oldStreamId });
              await NativeAudio.unload({ assetId: oldStreamId });
            } catch (e) {
              // Ignore errors here as the old stream might not exist
            }

            // Start playback
            await NativeAudio.play({ assetId });
            this.startProgressTracking();

            this.updatePlaybackState({
              currentTrack: track,
              isPlaying: true,
              currentTime: 0,
              duration: track.duration || 30 // Default to 30s for preview tracks
            });
            return;
          }

          // For local files, use the existing file path logic
          const filePath = this.getNormalizedFilePath(track.pathOrUrl);
          console.log('Attempting native playback of local file:', filePath);

          this.currentTrackId = track.id;
          await NativeAudio.preload({
            assetPath: filePath,
            assetId: track.id
          });

          await NativeAudio.play({ assetId: track.id });
          this.startProgressTracking();

          this.updatePlaybackState({
            currentTrack: track,
            isPlaying: true,
            currentTime: 0,
            duration: track.duration || 0
          });
        } catch (nativeError) {
          console.error('Native audio playback failed:', nativeError);
          // Fall back to web audio
          await this.fallbackToWebAudio(track);
        }
      } else {
        // Web audio playback
        await this.playWithWebAudio(track);
      }
    } catch (error) {
      console.error('Error in loadAndPlayTrack:', error);
      await this.handleMediaPlaybackError(track, 'loadAndPlayTrack');
    }
  }

  private async playWithWebAudio(track: Track): Promise<void> {
    try {
      // For streaming tracks, use the URL directly
      if (track.source === 'stream' && track.pathOrUrl) {
        this.audio = new Audio(track.pathOrUrl);
      } else {
        // For local files, get from storage and create blob URL
        const audioBlob = await this.getAudioFile(track.id);
        const blobUrl = URL.createObjectURL(audioBlob);
        this.audio = new Audio(blobUrl);

        // Clean up blob URL when done
        this.audio.onended = () => {
          URL.revokeObjectURL(blobUrl);
          this.onTrackEnded();
        };
      }

      // Set up event handlers
      this.setupAudioEvents();
      this.audio.volume = this.volume;

      // Start playback
      await this.audio.play();
      
      this.updatePlaybackState({
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
        duration: track.duration || (track.source === 'stream' ? 30 : 0)
      });
    } catch (error) {
      console.error('Web audio playback failed:', error);
      throw error;
    }
  }

  private async fallbackToWebAudio(track: Track): Promise<void> {
    console.log('Falling back to web audio playback');
    this.isNative = false;
    await this.playWithWebAudio(track);
  }

  /**
   * Store an audio file in storage
   */
  private async storeAudioFile(file: File | Blob, trackId: string): Promise<void> {
    if (this.platform.is('capacitor')) {
      const base64Data = await this.blobToBase64(file);
      await Filesystem.writeFile({
        path: `audio/${trackId}`,
        data: base64Data,
        directory: Directory.Data
      });
    } else {
      await this.storeFileInIndexedDB(trackId, file);
    }
  }

  /**
   * Convert blob to base64
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1]); // Remove data URL prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private base64ToBlob(base64: string, contentType: string = 'audio/wav'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  /**
   * Initialize IndexedDB database
   */
  private async initializeIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open('AudioFiles', 2); // Increment version to force upgrade

      openRequest.onupgradeneeded = (event) => {
        console.log('Upgrading IndexedDB');
        const db = (event.target as IDBOpenDBRequest).result;
        
        // If the store exists, delete it and recreate
        if (db.objectStoreNames.contains('files')) {
          db.deleteObjectStore('files');
        }
        
        // Create the store
        console.log('Creating files object store');
        db.createObjectStore('files');
      };

      openRequest.onerror = () => {
        console.error('Error opening IndexedDB:', openRequest.error);
        reject(openRequest.error);
      };

      openRequest.onsuccess = () => {
        const db = openRequest.result;
        console.log('IndexedDB opened successfully');
        resolve(db);
      };
    });
  }

  /**
   * Store file in IndexedDB
   */  private async storeFileInIndexedDB(trackId: string, file: File | Blob): Promise<void> {
    try {
      const db = await this.initializeIndexedDB();
      
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction('files', 'readwrite');
          const store = tx.objectStore('files');
          
          const storeRequest = store.put(file, trackId);
          
          storeRequest.onerror = () => {
            console.error('Error storing file:', storeRequest.error);
            reject(storeRequest.error);
          };
          
          storeRequest.onsuccess = () => {
            console.log('File stored successfully');
            resolve();
          };

          tx.oncomplete = () => {
            console.log('Transaction completed');
            db.close();
          };
          
          tx.onerror = () => {
            console.error('Transaction error:', tx.error);
            reject(tx.error);
          };
        } catch (error) {
          console.error('Error in transaction:', error);
          reject(error);
        }
      });
    } catch (error) {
      console.error('Error initializing IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Get a file from storage
   */
  private async getAudioFile(trackId: string): Promise<Blob> {
    if (this.platform.is('capacitor')) {
      const result = await Filesystem.readFile({
        path: `audio/${trackId}`,
        directory: Directory.Data
      });
      
      if (typeof result.data === 'string') {
        return this.base64ToBlob(result.data, 'audio/wav');
      } else {
        // If it's already a Blob, return it
        return result.data as Blob;
      }
    } else {
      return this.getFileFromIndexedDB(trackId);
    }
  }

  /**
   * Get file from IndexedDB
   */  private async getFileFromIndexedDB(trackId: string): Promise<Blob> {
    try {
      const db = await this.initializeIndexedDB();
      
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction('files', 'readonly');
          const store = tx.objectStore('files');
          
          const getRequest = store.get(trackId);
          
          getRequest.onerror = () => {
            console.error('Error getting file:', getRequest.error);
            reject(getRequest.error);
          };
          
          getRequest.onsuccess = () => {
            if (getRequest.result) {
              console.log('File retrieved successfully');
              resolve(getRequest.result);
            } else {
              console.error('File not found in IndexedDB');
              reject(new Error('File not found'));
            }
          };

          tx.oncomplete = () => {
            console.log('Transaction completed');
            db.close();
          };
          
          tx.onerror = () => {
            console.error('Transaction error:', tx.error);
            reject(tx.error);
          };
        } catch (error) {
          console.error('Error in transaction:', error);
          reject(error);
        }
      });
    } catch (error) {
      console.error('Error initializing IndexedDB:', error);
      throw error;
    }
  }

  private activeAudioIds: Set<string> = new Set();

  private async stopCurrentPlayback(): Promise<void> {
    // Create an array to store all cleanup promises
    const cleanupPromises: Promise<void>[] = [];

    // Stop any web audio playback
    if (this.audio && this.audioErrorHandler) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.removeEventListener('error', this.audioErrorHandler);
      this.audioErrorHandler = null;
      this.audio = null;
    }
    
    // Stop all native audio playback
    if (this.currentTrackId) {
      // Add current track to active IDs if not already there
      this.activeAudioIds.add(this.currentTrackId);
      
      // Attempt to stop and unload all tracked audio IDs
      for (const audioId of this.activeAudioIds) {
        cleanupPromises.push(
          (async () => {
            try {
              // First stop the playback
              await NativeAudio.stop({ assetId: audioId });
              // Then unload the audio to free up resources
              await NativeAudio.unload({ assetId: audioId });
              
              // If this is a stream track, also try to unload with the stream- prefix
              if (audioId.includes('stream-')) {
                try {
                  await NativeAudio.unload({ assetId: audioId });
                } catch (e) {
                  // Ignore errors here as the track might already be unloaded
                }
              }
            } catch (e) {
              console.warn(`Error stopping/unloading native audio ${audioId}:`, e);
            }
          })()
        );
      }
      
      // Wait for all cleanup operations to complete
      await Promise.all(cleanupPromises);
      
      // Clear the active audio IDs and current track
      this.activeAudioIds.clear();
      this.currentTrackId = null;
    }

    // Always stop progress tracking
    this.stopProgressTracking();
    
    // Reset playback state
    this.updatePlaybackState({ 
      isPlaying: false,
      currentTime: 0
    });
  }

  /**
   * Handle media playback errors by trying different approaches
   */
  private async handleMediaPlaybackError(track: Track, errorSource: string): Promise<void> {
    console.log(`Handling media playback error from ${errorSource}`);
    
    // If the error is with the specific problematic track, try even harder to find it
    if (track.id === 'dfbdb514-b070-458f-b1a5-cdff068fc6b9') {
      const alternativePath = await this.findAlternativeFilePath(track);
      if (alternativePath) {
        console.log('Found alternative path for problematic track, retrying with:', alternativePath);
        track.pathOrUrl = alternativePath;
        try {
          // If we were using native audio, try web audio
          if (this.isNative && errorSource === 'final-fallback') {
            this.isNative = false;
            if (!this.audio) {
              this.audio = new Audio();
              this.setupAudioEvents();
            }
            
            const filePath = this.getNormalizedFilePath(track.pathOrUrl);
            console.log('Using Web Audio with path:', filePath);
            
            this.audio.src = filePath;
            this.audio.volume = this.volume;
            await this.audio.play();
            
            this.updatePlaybackState({
              isPlaying: true,
              currentTrack: track,
              currentTime: 0,
              duration: track.duration || 0
            });
            return;
          } else {
            // Otherwise try the whole playback logic again
            return await this.loadAndPlayTrack(track);
          }
        } catch (retryError) {
          console.error('Still failed after handling error:', retryError);
        }
      }
    }
    
    // Try web audio as last resort if we were using native
    if (this.isNative) {
      console.log('Attempting to recover with web audio...');
      this.isNative = false;
      try {
        if (!this.audio) {
          this.audio = new Audio();
          this.setupAudioEvents();
        }
        
        // Try with a normalized path
        const filePath = this.getNormalizedFilePath(track.pathOrUrl);
        console.log('Recovery attempt with path:', filePath);
        
        this.audio.src = filePath;
        this.audio.volume = this.volume;
        await this.audio.play();
        
        this.updatePlaybackState({
          isPlaying: true,
          currentTrack: track,
          currentTime: 0,
          duration: track.duration || 0
        });
        return;
      } catch (fallbackError) {
        console.error('Fallback playback also failed:', fallbackError);
        this.isNative = this.platform.is('android') || this.platform.is('ios');
      }
    }
    
    this.updatePlaybackState({ isPlaying: false });
  }
  /**
   * Handle track ended event
   */
  private onTrackEnded(): void {
    const state = this.playbackStateSubject.value;
    
    // Stop progress tracking for the ended track
    this.stopProgressTracking();
    
    // Handle different repeat modes
    if (state.repeatMode === RepeatMode.One) {
      // Repeat the current track
      this.play(state.currentTrack!);
    } else if (state.repeatMode === RepeatMode.All && 
               this.currentIndex === this.queue.length - 1) {
      // Repeat the queue from the beginning
      this.currentIndex = 0;
      this.play(this.queue[0]);
    } else {
      // Try to play next track or stop
      this.next();
    }
  }
  /**
   * Start tracking progress for media playback
   */
  private startProgressTracking(): void {
    // Clear any existing interval
    this.stopProgressTracking();
    
    // Get current state
    const currentState = this.playbackStateSubject.value;
    let lastTime = currentState.currentTime || 0;
    
    // Only start tracking if we're actually playing
    if (!currentState.isPlaying) {
      return;
    }
    
    // Set up a new interval with higher frequency for smoother progress
    this.progressInterval = setInterval(() => {
      // Don't update if playback is paused
      if (!this.playbackStateSubject.value.isPlaying) {
        return;
      }
      
      if (this.nativeMedia) {
        // Get current position from native media
        this.nativeMedia.getCurrentPosition(
          (position: number) => {
            if (position >= 0) {
              // Valid position reported, update UI
              lastTime = position;
              // Cap at 30 seconds
              if (lastTime > 30) {
                lastTime = 30;
              }
              this.updatePlaybackState({ currentTime: lastTime });
            } else {
              // If position isn't available, simulate progress
              lastTime += 0.1; // increment by 100ms since our interval is 100ms
              // Cap at 30 seconds
              if (lastTime > 30) {
                lastTime = 30;
              }
              this.updatePlaybackState({ currentTime: lastTime });
            }
          },
          (err: any) => {
            console.warn('Error getting media position:', err);
            // Simulate progress even on error
            lastTime += 0.1;
            if (lastTime > 30) {
              lastTime = 30;
            }
            this.updatePlaybackState({ currentTime: lastTime });
          }
        );
      } else if (this.isNative && this.currentTrackId) {
        // For other native implementations without position reporting,
        // simulate progress by incrementing the time
        lastTime += 0.1;
        if (lastTime > 30) {
          lastTime = 30;
        }
        this.updatePlaybackState({ currentTime: lastTime });
      } else if (this.audio) {
        // For web audio, update from the HTML audio element
        // but ensure we cap at 30 seconds
        let webTime = this.audio.currentTime;
        if (webTime > 30) {
          webTime = 30;
        }
        this.updatePlaybackState({ currentTime: webTime });
      }
    }, 100); // Update at 10Hz for smoother progress
  }
  
  /**
   * Stop tracking progress for native media
   */
  private stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private updatePlaybackState(update: Partial<PlaybackState>): void {
    const currentState = this.playbackStateSubject.value;
    this.playbackStateSubject.next({
      ...currentState,
      ...update
    });
  }

  /**
   * Audio file extensions to scan for
   */
  private audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
  
  /**
   * Common directories to scan for audio files
   */
  private directoriesToScan = [
    'Music',
    'Download',
    'DCIM/Audio',
    '/storage/emulated/0/Music',
    '/storage/emulated/0/Download',
  ];

  /**
   * Request storage permissions for Android
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // For actual implementation, use proper permission plugins
      // This is a simplified version
      const result = await Filesystem.requestPermissions();
      return result.publicStorage === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }  /**
   * Scans the device for audio files
   */
  async scanAudioFiles(): Promise<Track[]> {
    if (!this.platform.is('capacitor')) {
      console.warn('File scanning is only available on native devices');
      return [];
    }

    try {
      // Check permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Storage permissions not granted');
      }

      const tracks: Track[] = [];
      const processedPaths = new Set<string>(); // Track processed paths to avoid duplicates

      // Scan directories for audio files
      for (const dir of this.directoriesToScan) {
        try {
          await this.scanDirectory(dir, tracks, processedPaths);
        } catch (err) {
          console.log(`Could not scan directory: ${dir}`, err);
        }
      }

      // Save tracks to data service
      const currentTracks = await this.dataService.getAllTracks();
      const existingIds = currentTracks.map(t => t.pathOrUrl); // Use path as unique identifier
      
      // Only add tracks that don't already exist
      const newTracks = tracks.filter(t => !existingIds.includes(t.pathOrUrl));
      
      // Skip the problematic track with ID dfbdb514-b070-458f-b1a5-cdff068fc6b9 in DATA directory
      const filteredTracks = newTracks.filter(track => {
        if (track.id === 'dfbdb514-b070-458f-b1a5-cdff068fc6b9' && track.pathOrUrl?.includes('/DATA/music/')) {
          console.log('Skipping problematic track with ID:', track.id);
          return false;
        }
        return true;
      });
      
      // Save each new track
      for (const track of filteredTracks) {
        await this.dataService.saveLocalMusic(track, track.pathOrUrl);
      }
      
      console.log(`Found ${tracks.length} audio files, ${filteredTracks.length} new (after filtering)`);
      return tracks;
    } catch (error) {
      console.error('Error scanning audio files:', error);
      return [];
    }
  }
  /**
   * Recursively scan a directory for audio files
   */
  private async scanDirectory(path: string, tracks: Track[], processedPaths: Set<string> = new Set()): Promise<void> {
    try {
      const result = await Filesystem.readdir({
        path,
        directory: Directory.ExternalStorage
      });

      for (const entry of result.files) {
        const entryPath = `${path}/${entry.name}`;
        
        // Skip if we've already processed this path
        if (processedPaths.has(entryPath)) {
          continue;
        }
        
        // Mark this path as processed
        processedPaths.add(entryPath);
        
        if (entry.type === 'directory') {
          // Recursively scan subdirectories
          await this.scanDirectory(entryPath, tracks, processedPaths);
        } else if (entry.type === 'file') {
          // Check if file is an audio file
          const extension = entry.name.split('.').pop()?.toLowerCase();
          if (extension && this.audioExtensions.includes(extension)) {            // Get file stats
            const stats = await Filesystem.stat({
              path: entryPath,
              directory: Directory.ExternalStorage
            });
              // Create a unique ID for the file
            const id = uuidv4();
            
            // Extract metadata from the filename
            const metadata = this.extractMetadataFromFilename(entry.name);
              // Store the full URI - this is what we'll use for playback
            const uri = stats.uri;
            console.log(`Found audio file: ${metadata.title} by ${metadata.artist}, URI: ${uri}`);
            
            // Skip known problematic files that cause errors
            if (entry.name === 'dfbdb514-b070-458f-b1a5-cdff068fc6b9.wav' && path.includes('/DATA/music/')) {
              console.log('Skipping problematic file in DATA directory:', entry.name);
              continue;
            }
            
            // Add file to the list
            tracks.push({
              id,
              title: metadata.title,
              artist: metadata.artist,
              album: 'Unknown Album',  // Default value, ideally would extract from metadata
              source: 'local',
              pathOrUrl: uri,
              duration: 0, // Will be filled when played
              addedAt: new Date().toISOString(),
              type: extension,
              artwork: 'assets/img/default-album-art.png' // Default artwork
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${path}:`, error);
    }
  }
  /**
   * Remove file extension from name
   */
  private getNameWithoutExtension(filename: string): string {
    return filename.replace(/\.[^/.]+$/, "");
  }
  
  /**
   * Extract metadata from filename when proper ID3 tags aren't available
   * Uses common naming patterns like "Artist - Title" or "Title"
   */
  private extractMetadataFromFilename(filename: string): { title: string, artist: string } {
    // Remove extension first
    const nameWithoutExt = this.getNameWithoutExtension(filename);
    
    // Check for common pattern: Artist - Title
    const artistTitleMatch = nameWithoutExt.match(/^(.+?)\s*-\s*(.+)$/);
    if (artistTitleMatch) {
      return {
        artist: artistTitleMatch[1].trim(),
        title: artistTitleMatch[2].trim()
      };
    }
    
    // Check for pattern with parentheses: Title (Artist)
    const titleArtistMatch = nameWithoutExt.match(/^(.+?)\s*\((.+?)\)$/);
    if (titleArtistMatch) {
      return {
        title: titleArtistMatch[1].trim(),
        artist: titleArtistMatch[2].trim()
      };
    }
    
    // If no pattern is detected, use the whole name as the title
    return {
      title: nameWithoutExt,
      artist: 'Unknown Artist'
    };
  }

  /**
   * Set shuffle mode
   */
  setShuffle(isActive: boolean): void {
    const state = this.playbackStateSubject.getValue();
    
    if (isActive) {
      // Save original queue
      this.originalQueue = [...this.queue];
      
      // Shuffle the queue
      const currentTrack = this.queue[this.currentIndex];
      const remainingTracks = this.queue.filter((_, i) => i !== this.currentIndex);
      const shuffledTracks = this.shuffleArray(remainingTracks);
      
      // Put current track at beginning and update queue
      this.queue = currentTrack ? [currentTrack, ...shuffledTracks] : shuffledTracks;
      this.currentIndex = currentTrack ? 0 : -1;
    } else {
      // Restore original queue
      const currentTrack = this.queue[this.currentIndex];
      this.queue = [...this.originalQueue];
        // Find current track in original queue
      if (currentTrack) {
        this.currentIndex = this.queue.findIndex(t => t.id === currentTrack.id);
        if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }
      }
    }
    
    // Update state
    this.updatePlaybackState({
      queue: this.queue,
      currentIndex: this.currentIndex,
      isShuffleActive: isActive
    });
  }

  /**
   * Set repeat mode
   */
  setRepeatMode(mode: RepeatMode): void {
    this.updatePlaybackState({ repeatMode: mode });
  }
  /**
   * Shuffle an array (Fisher-Yates algorithm)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }  /**
   * Normalize file path for different platforms
   * This handles the different ways file paths are represented on different platforms
   */  private getNormalizedFilePath(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    
    // Log the original path for debugging
    console.log('Original path:', pathOrUrl);
    
    // If it's an http URL, return as is
    if (pathOrUrl.startsWith('http')) {
      return pathOrUrl;
    }
    
    // For Android, handle content:// URIs
    if (pathOrUrl.startsWith('content://')) {
      return pathOrUrl;
    }
    
    // For Android file:// URIs, convert to a path that Cordova Media can use
    if (pathOrUrl.startsWith('file://')) {
      // On Android, remove file:// prefix for Cordova Media
      if (this.platform.is('android')) {
        return pathOrUrl.replace('file://', '');
      }
      // On iOS, leave the file:// prefix
      return pathOrUrl;
    }
    
    // Check for problematic track ID
    if (pathOrUrl.includes('dfbdb514-b070-458f-b1a5-cdff068fc6b9') && pathOrUrl.includes('/DATA/music/')) {
      console.log('Normalizing path for problematic track');
      const fixedPath = pathOrUrl.replace('/DATA/music/', '/DOCUMENTS/music/');
      
      // If we're on Android, we need to add the file:// prefix for proper handling
      if (this.platform.is('android')) {
        return `file://${fixedPath}`;
      }
      return fixedPath;
    }
    
    // For filesystem URIs from Capacitor, handle appropriately
    if (pathOrUrl.includes('DOCUMENTS') || pathOrUrl.includes('EXTERNAL') || 
        pathOrUrl.includes('DATA') || pathOrUrl.includes('DCIM')) {
      
      // If we have a path like /DOCUMENTS/music/file.mp3 or /DATA/music/file.mp3
      if (pathOrUrl.startsWith('/')) {
        // Special handling for DATA directory paths
        if (pathOrUrl.includes('/DATA/')) {
          // Try to redirect to DOCUMENTS as a more reliable path
          // This helps with the "Current directory does already exist" error
          const alternativePath = pathOrUrl.replace('/DATA/', '/DOCUMENTS/');
          console.log('Redirecting DATA path to:', alternativePath);
          
          // On Android, add file:// prefix
          if (this.platform.is('android')) {
            return `file://${alternativePath}`;
          }
          return alternativePath;
        }
        
        // On Android, we might need to add file:// prefix
        if (this.platform.is('android')) {
          return `file://${pathOrUrl}`;
        }
        // On iOS, handle differently
        if (this.platform.is('ios')) {
          return pathOrUrl;
        }
      }
    }
    
    // If we get here, assume it's a relative path and try to resolve it
    // This helps with paths like "assets/sounds/file.mp3"
    if (!pathOrUrl.startsWith('/') && !pathOrUrl.includes('://')) {
      if (pathOrUrl.startsWith('assets/')) {
        // For web testing, prepend the base URL
        if (!this.platform.is('capacitor')) {
          return `${window.location.origin}/${pathOrUrl}`;
        }
        // For native, try to resolve the asset path
        return pathOrUrl;
      }
    }
    
    // If nothing else matched, return the original path
    return pathOrUrl;
  }
    /**
   * Create a directory safely, handling the case where it already exists
   */
  private async createDirectorySafe(path: string, directory: Directory): Promise<void> {
    try {
      await Filesystem.mkdir({
        path,
        directory,
        recursive: true
      });
      console.log(`Created directory: ${path}`);
    } catch (error: any) {
      // If the error is that the directory already exists, that's fine
      if (error.message && error.message.includes('exists')) {
        console.log(`Directory already exists: ${path}`);
      } else {
        console.error(`Error creating directory ${path}:`, error);
        throw error;
      }
    }
  }
  
  /**
   * Find alternative file paths when the original path doesn't work
   */  private async findAlternativeFilePath(track: Track): Promise<string | null> {
    if (!track.pathOrUrl) return null;
    
    // Get the filename from the path
    const parts = track.pathOrUrl.split('/');
    const filename = parts[parts.length - 1];
    
    // Try different base directories in priority order
    const possibleDirs = [
      '/DOCUMENTS/music/',
      '/storage/emulated/0/Music/',
      '/storage/emulated/0/Download/',
      '/storage/emulated/0/DCIM/',
      '/Music/',
      '/Download/',
      '/Android/data/io.vibeflow.app/files/music/',
      '/storage/emulated/0/Android/data/io.vibeflow.app/files/music/'
    ];
    
    console.log(`Searching for alternative path for file: ${filename}`);
    
    // Handle the specific problematic file
    if (track.id === 'dfbdb514-b070-458f-b1a5-cdff068fc6b9' || 
        filename === 'dfbdb514-b070-458f-b1a5-cdff068fc6b9.wav') {
      // Special handling for known problematic file
      // First try DOCUMENTS directory
      try {
        const docPath = `/DOCUMENTS/music/${filename}`;
        await Filesystem.stat({
          path: docPath.replace('/DOCUMENTS/', ''),
          directory: Directory.Documents
        });
        console.log('Found file in Documents:', docPath);
        return docPath;
      } catch (e) {
        console.log('File not found in Documents directory');
      }
      
      // Try external storage
      try {
        const extPath = `/storage/emulated/0/Music/${filename}`;
        await Filesystem.stat({
          path: extPath,
          directory: Directory.ExternalStorage
        });
        console.log('Found file in external storage:', extPath);
        return extPath;
      } catch (e) {
        console.log('File not found in external storage');
      }
    }
    
    // Systematically try all possible directories
    for (const baseDir of possibleDirs) {
      try {
        const testPath = baseDir + filename;
        console.log('Trying path:', testPath);
        
        // Determine the appropriate directory type based on the path
        let directory = Directory.Data;
        if (baseDir.startsWith('/DOCUMENTS/')) {
          directory = Directory.Documents;
        } else if (baseDir.includes('/storage/emulated/0/') || baseDir.startsWith('/storage/')) {
          directory = Directory.ExternalStorage;
        }
        
        // Strip the directory prefix for the stat call
        const statPath = testPath
          .replace('/DOCUMENTS/', '')
          .replace('/storage/emulated/0/', '')
          .replace('/storage/', '');
        
        await Filesystem.stat({
          path: statPath,
          directory
        });
        
        console.log('Found file at:', testPath);
        return testPath;
      } catch (e) {
        // File not found in this location, continue to next
        console.log(`File not found at ${baseDir}`);
      }
    }
    
    // If we get here, we couldn't find the file in any location
    console.warn('Could not find alternative path for:', filename);
    return null;
  }
  
  /**
   * Save a file to the device's music directory
   */
  async saveFileToMusic(uri: string, filename: string): Promise<string> {
    try {
      // Create the music directory if it doesn't exist
      await this.createDirectorySafe('music', Directory.Documents);
      
      // Get the file data
      const fileData = await Filesystem.readFile({ path: uri });
      
      // Save the file to the music directory
      const result = await Filesystem.writeFile({
        path: `music/${filename}`,
        data: fileData.data,
        directory: Directory.Documents,
        recursive: true
      });
      
      console.log(`File saved to: ${result.uri}`);
      return result.uri;
    } catch (error) {
      console.error('Error saving file to music directory:', error);
      throw error;
    }
  }

  /**
   * Add a local audio track by processing a file
   * Handles upload, conversion, save, and metadata extraction
   */
  async addLocalTrack(file: File): Promise<Track> {
    try {
      // Create a unique ID for the track
      const trackId = uuidv4();
      
      // Generate a safe filename with the original extension
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const fileName = `${trackId}.${fileExt}`;
      
      // Extract metadata from the audio file
      const metadata = await this.extractAudioMetadata(file);
      
      // First create the directory if it doesn't exist
      await this.createDirectorySafe('music', Directory.Documents);
      
      // Convert file to base64
      const base64Data = await this.fileToBase64(file);
      
      // Save the file to the filesystem
      const result = await Filesystem.writeFile({
        path: `music/${fileName}`,
        data: base64Data,
        directory: Directory.Documents
      });
      
      // Create track object
      const track: Track = {
        id: trackId,
        title: metadata.title || file.name.replace(`.${fileExt}`, ''),
        artist: metadata.artist || 'Unknown Artist',
        album: metadata.album || 'Unknown Album',
        artwork: metadata.artwork || 'assets/placeholder-album.png',
        source: 'local',
        pathOrUrl: result.uri,
        duration: metadata.duration || 0,
        addedAt: new Date().toISOString(),
        type: fileExt
      };
      
      // Save track metadata in data service
      await this.dataService.saveLocalMusic(track, result.uri);
      
      return track;
    } catch (error) {
      console.error('Error adding local track:', error);
      throw error;
    }
  }
  
  /**
   * Extract metadata from an audio file
   */
  private async extractAudioMetadata(file: File): Promise<{
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    duration?: number;
  }> {
    return new Promise((resolve) => {
      // Create an audio element to read metadata
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      
      // Set up event listeners
      audio.addEventListener('loadedmetadata', () => {
        // Get basic metadata
        const duration = audio.duration;
        
        // Attempt to extract filename-based metadata
        const fileNameInfo = this.extractMetadataFromFilename(file.name);
        
        resolve({
          title: fileNameInfo.title,
          artist: fileNameInfo.artist,
          duration: duration || 0
        });
        
        // Clean up
        URL.revokeObjectURL(url);
      });
      
      audio.addEventListener('error', () => {
        console.error('Error loading audio for metadata extraction');
        // If we can't load the audio, try to extract info from filename
        const fileNameInfo = this.extractMetadataFromFilename(file.name);
        resolve({
          title: fileNameInfo.title,
          artist: fileNameInfo.artist
        });
        URL.revokeObjectURL(url);
      });
      
      // Load the audio
      audio.src = url;
      audio.load();
    });
  }
  
  /**
   * Convert a File object to base64 string
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix if present
        const base64Data = base64String.split(',')[1] || base64String;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
