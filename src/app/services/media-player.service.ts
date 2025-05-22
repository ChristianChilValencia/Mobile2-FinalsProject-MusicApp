import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Track, PlaybackState, RepeatMode } from '../models/track.model';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs';
import { NativeAudio } from '@capacitor-community/native-audio';
import { DataService } from './data.service';
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
      }    } catch (error) {
      console.error('Error loading and playing track:', error);
      console.error('Problem with track:', {
        id: track.id,
        title: track.title,
        source: track.source,
        path: track.pathOrUrl
      });
      
      // Try to recover by attempting to play with web audio as last resort
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
  }

  /**
   * Handle track ended event
   */
  private onTrackEnded(): void {
    const state = this.playbackStateSubject.value;
    
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
   */
  private startProgressTracking(): void {
    // Clear any existing interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    // Set up a new interval
    this.progressInterval = setInterval(() => {
      if (this.nativeMedia) {
        // Get current position
        this.nativeMedia.getCurrentPosition(
          (position: number) => {
            if (position >= 0) {
              this.updatePlaybackState({ currentTime: position });
            }
          },
          (err: any) => {
            console.warn('Error getting media position:', err);
          }
        );
      }
    }, 1000);
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
  }
  /**
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

      // Scan directories for audio files
      for (const dir of this.directoriesToScan) {
        try {
          await this.scanDirectory(dir, tracks);
        } catch (err) {
          console.log(`Could not scan directory: ${dir}`, err);
        }
      }

      // Save tracks to data service
      const currentTracks = await this.dataService.getAllTracks();
      const existingIds = currentTracks.map(t => t.pathOrUrl); // Use path as unique identifier
      
      // Only add tracks that don't already exist
      const newTracks = tracks.filter(t => !existingIds.includes(t.pathOrUrl));
      
      // Save each new track
      for (const track of newTracks) {
        await this.dataService.saveLocalMusic(track, track.pathOrUrl);
      }
      
      console.log(`Found ${tracks.length} audio files, ${newTracks.length} new`);
      return tracks;
    } catch (error) {
      console.error('Error scanning audio files:', error);
      return [];
    }
  }
  /**
   * Recursively scan a directory for audio files
   */
  private async scanDirectory(path: string, tracks: Track[]): Promise<void> {
    try {
      const result = await Filesystem.readdir({
        path,
        directory: Directory.ExternalStorage
      });

      for (const entry of result.files) {
        const entryPath = `${path}/${entry.name}`;
        
        if (entry.type === 'directory') {
          // Recursively scan subdirectories
          await this.scanDirectory(entryPath, tracks);
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
  }
  /**
   * Normalize file path for different platforms
   * This handles the different ways file paths are represented on different platforms
   */
  private getNormalizedFilePath(pathOrUrl: string): string {
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
    
    // For filesystem URIs from Capacitor, handle appropriately
    if (pathOrUrl.includes('DOCUMENTS') || pathOrUrl.includes('EXTERNAL')) {
      // If we have a path like /DOCUMENTS/music/file.mp3
      if (pathOrUrl.startsWith('/')) {
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
