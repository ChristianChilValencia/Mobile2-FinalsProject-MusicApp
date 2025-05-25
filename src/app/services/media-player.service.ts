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
    
    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.updatePlaybackState({ isPlaying: false });
    });
  }  private async loadAndPlayTrack(track: Track): Promise<void> {
    try {
      // Stop any current playback
      if (this.isNative) {
        if (this.nativeMedia) {
          try {
            this.nativeMedia.stop();
            this.nativeMedia.release();
            this.nativeMedia = null;
            // Make sure to stop progress tracking when stopping playback
            this.stopProgressTracking();
          } catch (e) {
            console.warn('Error stopping native media:', e);
          }
        }
        
        if (this.currentTrackId) {
          try {
            await NativeAudio.stop({ assetId: this.currentTrackId });
            await NativeAudio.unload({ assetId: this.currentTrackId });
          } catch (e) {
            // Ignore errors from stopping/unloading, might not be loaded yet
          }
        }
      } else if (this.audio) {
        this.audio.pause();
        this.audio.src = '';
      }
      
      // Log the track information for debugging
      console.log('Playing track:', {
        id: track.id,
        title: track.title,
        path: track.pathOrUrl,
        source: track.source
      });
      
      // Handle specific problematic track IDs
      if (track.id === 'dfbdb514-b070-458f-b1a5-cdff068fc6b9') {
        console.log('Detected problematic track ID, redirecting to proper file location');
        
        // Try to find the file with a more reliable approach
        if (track.pathOrUrl && track.pathOrUrl.includes('/DATA/music/')) {
          // First try the DOCUMENTS directory instead
          track.pathOrUrl = track.pathOrUrl.replace('/DATA/music/', '/DOCUMENTS/music/');
          console.log('Redirected to:', track.pathOrUrl);
          
          // Check if the file exists at the new location
          try {
            await Filesystem.stat({
              path: track.pathOrUrl.replace('/DOCUMENTS/', ''),
              directory: Directory.Documents
            });
            console.log('File exists at redirected location');
          } catch (e) {
            // If not found in Documents, look for an alternative path
            const alternativePath = await this.findAlternativeFilePath(track);
            if (alternativePath) {
              track.pathOrUrl = alternativePath;
              console.log('Using alternative path for problematic file:', alternativePath);
            } else {
              console.warn('Could not find alternative path for problematic file');
            }
          }
        }
      }
      
      this.currentTrackId = track.id;
      
      if (this.isNative) {
        // Try to use Cordova Media for local files (better for large files)
        if (track.source === 'local' && typeof Media !== 'undefined') {
          try {
            // Clean and normalize the file path for Cordova Media
            const filePath = this.getNormalizedFilePath(track.pathOrUrl);
            console.log('Using Cordova Media with path:', filePath);
            
            this.nativeMedia = new Media(
              filePath,
              // Success callback
              () => {
                console.log('Media playback finished successfully');
                this.onTrackEnded();
              },
              // Error callback
              (err: any) => {
                console.error('Media playback error:', err);
                this.updatePlaybackState({ isPlaying: false });
                
                // Try alternative approach if Cordova Media fails
                this.handleMediaPlaybackError(track, 'cordova-media');
              },
              // Status callback
              (status: number) => {
                console.log('Media status:', status);
              }
            );
            
            // Start playing
            this.nativeMedia.play();
            
            // Get duration
            this.nativeMedia.getDuration((duration: number) => {
              if (duration > 0) {
                this.updatePlaybackState({ duration });
              }
            });
            
            // Start progress tracking
            this.startProgressTracking();
            
            this.updatePlaybackState({
              isPlaying: true,
              currentTrack: track,
              currentTime: 0,
              duration: track.duration || 0
            });
            return;
          } catch (e) {
            console.warn('Error using Cordova Media, falling back to NativeAudio:', e);
            this.nativeMedia = null;
          }
        }
        
        // Fall back to NativeAudio
        try {
          // For local files, use native audio for better performance
          if (track.source === 'local') {
            // Normalize the file path
            const filePath = this.getNormalizedFilePath(track.pathOrUrl);
            console.log('Using NativeAudio with path:', filePath);
            
            await NativeAudio.preload({
              assetId: track.id,
              assetPath: filePath,
              audioChannelNum: 1,
              isUrl: filePath.startsWith('http') || filePath.startsWith('file://') || filePath.startsWith('content://')
            });
          } else {
            // For streaming, we need to use the URL
            console.log('Using NativeAudio with streaming URL:', track.pathOrUrl);
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
            duration: track.duration || 0
          });
        } catch (e) {
          console.error('Error with NativeAudio, falling back to HTML Audio:', e);
          this.isNative = false;
          
          // Try with web audio as a fallback
          this.handleMediaPlaybackError(track, 'native-audio');
        }
      }
      
      // Fallback to web audio
      if (!this.isNative) {
        if (!this.audio) {
          this.audio = new Audio();
          this.setupAudioEvents();
        }
        
        // Normalize the file path for web audio
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
      }
    } catch (error) {
      console.error('Error loading and playing track:', error);
      console.error('Problem with track:', {
        id: track.id,
        title: track.title,
        source: track.source,
        path: track.pathOrUrl
      });
      
      // Try to find an alternative path for the file
      const alternativePath = await this.findAlternativeFilePath(track);
      if (alternativePath) {
        console.log('Found alternative path, retrying with:', alternativePath);
        track.pathOrUrl = alternativePath;
        try {
          return await this.loadAndPlayTrack(track);
        } catch (retryError) {
          console.error('Still failed after trying alternative path:', retryError);
        }
      }
      
      // Try to recover by attempting to play with web audio as last resort
      await this.handleMediaPlaybackError(track, 'final-fallback');
    }
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
   * Start tracking progress for native media
   */  private startProgressTracking(): void {
    // Clear any existing interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    // Get current state
    const currentState = this.playbackStateSubject.value;
    let lastTime = currentState.currentTime || 0;
    
    // Set up a new interval
    this.progressInterval = setInterval(() => {
      if (this.nativeMedia) {
        // Get current position from native media
        this.nativeMedia.getCurrentPosition(
          (position: number) => {
            if (position >= 0) {
              // Update UI with new position
              this.updatePlaybackState({ currentTime: position });
              lastTime = position;
            } else {
              // If position isn't available (some devices have issues),
              // simulate progress by incrementing lastTime
              lastTime += 0.1; // increment by 100ms
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
      }
    }, 100); // Update more frequently for smoother progress
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
  private readonly audioExtensions = [
    'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus'
  ];
  
  /**
   * Common directories to scan for audio files
   */
  private readonly directoriesToScan = [
    '/Music',
    '/Download',
    '/DCIM',
    '/storage/emulated/0/Music',
    '/storage/emulated/0/Download',
    '/storage/emulated/0/DCIM',
    '/storage/emulated/0/Android/media'
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
        if (this.currentIndex === -1) this.currentIndex = 0;
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
      console.log('Handling known problematic file ID: dfbdb514-b070-458f-b1a5-cdff068fc6b9');
      
      // Try every possible location for this specific file
      for (const dir of possibleDirs) {
        const newPath = dir + filename;
        console.log(`Trying alternative path: ${newPath}`);
        try {
          // Check if this file exists
          await Filesystem.stat({
            path: newPath,
            directory: Directory.ExternalStorage
          });
          
          // If we got here, the file exists at this location
          console.log(`Found file at alternative location: ${newPath}`);
          return newPath;
        } catch (error) {
          console.log(`File not found at: ${newPath}`);
        }
      }
      
      // As a fallback for this specific file, try to create a copy in the Documents directory
      try {
        console.log('Attempting to copy problematic file to DOCUMENTS directory');
        // First try to find it in any location
        for (const dir of ['/DATA/music/', '/storage/emulated/0/Music/']) {
          try {
            const sourcePath = dir + filename;
            // Try to read the file from source
            const fileData = await Filesystem.readFile({
              path: sourcePath,
              directory: Directory.ExternalStorage
            });
            
            // If we found it, write to the DOCUMENTS directory
            const destPath = '/DOCUMENTS/music/' + filename;
            await this.createDirectorySafe('music', Directory.Documents);
            
            // Write the file to Documents directory
            await Filesystem.writeFile({
              path: 'music/' + filename,
              data: fileData.data,
              directory: Directory.Documents
            });
            
            console.log(`Successfully copied file to: ${destPath}`);
            return destPath;
          } catch (e: any) {
            console.log(`Could not copy from ${dir}: ${e.message}`);
          }
        }
      } catch (copyError) {
        console.error('Error during file copy attempt:', copyError);
      }
    }
    
    // Try different variations of the path
    // 1. Try replacing DATA with DOCUMENTS
    if (track.pathOrUrl.includes('/DATA/')) {
      const altPath = track.pathOrUrl.replace('/DATA/', '/DOCUMENTS/');
      console.log(`Trying DATA to DOCUMENTS replacement: ${altPath}`);
      try {
        await Filesystem.stat({
          path: altPath,
          directory: Directory.ExternalStorage
        });
        console.log(`File found at: ${altPath}`);
        return altPath;
      } catch (error) {
        console.log(`File not found at: ${altPath}`);
        // File not found, continue with other attempts
      }
    }
    
    // 2. Try all possible directory structures
    for (const dir of possibleDirs) {
      const altPath = dir + filename;
      console.log(`Trying path: ${altPath}`);
      try {
        await Filesystem.stat({
          path: altPath,
          directory: Directory.ExternalStorage
        });
        console.log(`File found at: ${altPath}`);
        return altPath;
      } catch (error) {
        console.log(`File not found at: ${altPath}`);
        // File not found, continue with other attempts
      }
    }
    
    // 3. For Android 10+, try using content:// URI as a last resort
    if (this.platform.is('android')) {
      try {
        // This is a speculative approach - we're hoping the file might be accessible via content URI
        const contentPath = `content://media/external/audio/media/${track.id}`;
        console.log(`Trying content URI path: ${contentPath}`);
        return contentPath;
      } catch (error) {
        console.log('Could not create content URI');
      }
    }
    
    console.log('No alternative path found after trying all options');
    // No alternative found
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
}
