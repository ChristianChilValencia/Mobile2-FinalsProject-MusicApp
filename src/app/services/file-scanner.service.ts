import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataService, Track } from './data.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class FileScannerService {
  private _isScanning = new BehaviorSubject<boolean>(false);
  public readonly isScanning$: Observable<boolean> = this._isScanning.asObservable();
  
  // Audio file types to scan for
  private readonly audioExtensions = [
    'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus'
  ];
  
  // Common directories to scan - these are the most likely places to find audio files
  private readonly directoriesToScan = [
    '/Music',
    '/Download',
    '/DCIM',
    '/storage/emulated/0/Music',
    '/storage/emulated/0/Download',
    '/storage/emulated/0/DCIM',
    '/storage/emulated/0/Android/media',
    '/storage/emulated/0/Sounds',
    '/storage/emulated/0/Podcasts',
    '/storage/emulated/0/Audiobooks',
    '/storage/emulated/0/Ringtones',
    '/storage/emulated/0/Audio'
  ];

  constructor(
    private platform: Platform,
    private dataService: DataService
  ) {}

  /**
   * Requests permissions needed for file access
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // Request filesystem permissions
      const result = await Filesystem.requestPermissions();
      return result.publicStorage === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Scan the device for audio files
   */
  async scanAudioFiles(): Promise<Track[]> {
    if (!this.platform.is('capacitor')) {
      console.warn('File scanning is only available on native devices');
      return [];
    }

    this._isScanning.next(true);
    const audioTracks: Track[] = [];

    try {
      // Check permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Storage permissions not granted');
      }

      // Scan each directory
      for (const dir of this.directoriesToScan) {
        try {
          await this.scanDirectory(dir, audioTracks);
        } catch (err) {
          console.log(`Could not scan directory: ${dir}`, err);
        }
      }

      // Save tracks to data service
      const existingTracks = await this.dataService.getAllTracks();
      const existingPaths = existingTracks.map(t => t.pathOrUrl);
      
      // Only save new tracks
      const newTracks = audioTracks.filter(t => !existingPaths.includes(t.pathOrUrl));
      
      for (const track of newTracks) {
        await this.dataService.saveLocalMusic(track, track.pathOrUrl);
      }
      
      console.log(`Found ${audioTracks.length} audio files, ${newTracks.length} new`);
      return audioTracks;
    } catch (error) {
      console.error('Error scanning audio files:', error);
      return [];
    } finally {
      this._isScanning.next(false);
    }
  }

  /**
   * Recursively scan a directory for audio files
   */
  private async scanDirectory(path: string, tracks: Track[]): Promise<void> {
    try {
      // Try to read the directory
      const result = await Filesystem.readdir({
        path,
        directory: Directory.ExternalStorage
      });

      // Process each file/directory
      for (const entry of result.files) {
        const entryPath = `${path}/${entry.name}`;
        
        if (entry.type === 'directory') {
          // Skip common directories that typically don't contain audio files
          if (this.shouldSkipDirectory(entry.name)) {
            continue;
          }
          
          // Recursively scan subdirectories
          await this.scanDirectory(entryPath, tracks);
        } else if (entry.type === 'file') {
          // Check if file is an audio file
          const extension = entry.name.split('.').pop()?.toLowerCase();
          if (extension && this.audioExtensions.includes(extension)) {
            try {
              // Get file stats
              const stats = await Filesystem.stat({
                path: entryPath,
                directory: Directory.ExternalStorage
              });
              
              // Create a unique ID for the file
              const id = uuidv4();
              
              // Extract track metadata from the filename
              const { title, artist, album } = this.extractMetadataFromFilename(entry.name);
              
              // Add file to the list
              tracks.push({
                id,
                title,
                artist,
                album,
                source: 'local',
                pathOrUrl: stats.uri,
                duration: 0, // Will be filled when played
                addedAt: new Date().toISOString(),
                type: extension
              });
            } catch (fileError) {
              console.warn(`Error processing file: ${entryPath}`, fileError);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${path}:`, error);
    }
  }

  /**
   * Skip directories that typically don't contain audio files
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipList = [
      'cache', '.cache', 'tmp', '.tmp', 'temp', '.temp', 
      'thumbnails', '.thumbnails', 'android', 'logs', '.logs',
      'system', 'config', '.config', 'data', '.data',
      'app', 'apps', 'games', 'photos', 'images', 'pictures',
      'videos', 'documents', 'backup', '.backup'
    ];
    
    return skipList.some(skip => 
      dirName.toLowerCase() === skip || 
      dirName.toLowerCase().startsWith(`.${skip}`)
    );
  }

  /**
   * Extract metadata from filename
   * Common patterns: "Artist - Title", "Artist - Album - Title", "Title"
   */
  private extractMetadataFromFilename(filename: string): { title: string, artist: string, album: string } {
    // Remove file extension
    const nameWithoutExtension = this.getNameWithoutExtension(filename);
    
    // Default values
    let title = nameWithoutExtension;
    let artist = 'Unknown Artist';
    let album = 'Unknown Album';
    
    // Try to extract artist and title from common patterns
    if (nameWithoutExtension.includes(' - ')) {
      const parts = nameWithoutExtension.split(' - ');
      
      // Format: "Artist - Title"
      if (parts.length === 2) {
        artist = parts[0].trim();
        title = parts[1].trim();
      } 
      // Format: "Artist - Album - Title"
      else if (parts.length >= 3) {
        artist = parts[0].trim();
        album = parts[1].trim();
        title = parts.slice(2).join(' - ').trim();
      }
    }
    
    return { title, artist, album };
  }

  /**
   * Remove file extension from name
   */
  private getNameWithoutExtension(filename: string): string {
    return filename.replace(/\.[^/.]+$/, "");
  }
}
