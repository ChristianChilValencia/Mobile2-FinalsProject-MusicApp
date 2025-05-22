import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';

export interface AudioFile {
  id: string;
  path: string;
  uri: string;
  name: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  albumArtUri?: string;
  size?: number;
  type: string;
}

export enum RepeatMode {
  None = 'none',
  All = 'all',
  One = 'one'
}

@Injectable({
  providedIn: 'root'
})
export class FileSystemService {
  
  private _audioFiles = new BehaviorSubject<AudioFile[]>([]);
  private _isScanning = new BehaviorSubject<boolean>(false);
  private _initialized = false;
  
  public readonly audioFiles$: Observable<AudioFile[]> = this._audioFiles.asObservable();
  public readonly isScanning$: Observable<boolean> = this._isScanning.asObservable();
  
  // Audio file types to scan for
  private readonly audioExtensions = [
    'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus'
  ];
  
  // Common directories to scan
  private readonly directoriesToScan = [
    '/Music',
    '/Download',
    '/DCIM',
    '/storage/emulated/0/Music',
    '/storage/emulated/0/Download',
    '/storage/emulated/0/DCIM',
    '/storage/emulated/0/Android/media'
  ];

  constructor(
    private platform: Platform,
    private storage: Storage
  ) {
    this.init();
  }

  async init() {
    if (this._initialized) return;
    
    await this.storage.create();
    this._initialized = true;
    
    // Load cached files if available
    const cachedFiles = await this.storage.get('audioFiles');
    if (cachedFiles && cachedFiles.length > 0) {
      this._audioFiles.next(cachedFiles);
    }
  }

  /**
   * Requests permissions needed for file access
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
   * Scan the device for audio files
   */
  async scanAudioFiles(): Promise<AudioFile[]> {
    if (!this.platform.is('capacitor')) {
      console.warn('File scanning is only available on native devices');
      return [];
    }

    this._isScanning.next(true);
    const files: AudioFile[] = [];

    try {
      // Check permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Storage permissions not granted');
      }

      // Scan directories for audio files
      for (const dir of this.directoriesToScan) {
        try {
          await this.scanDirectory(dir, files);
        } catch (err) {
          console.log(`Could not scan directory: ${dir}`, err);
        }
      }

      // Update and cache the audio files
      this._audioFiles.next(files);
      await this.storage.set('audioFiles', files);
      
      return files;
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
  private async scanDirectory(path: string, files: AudioFile[]): Promise<void> {
    try {
      const result = await Filesystem.readdir({
        path,
        directory: Directory.ExternalStorage
      });

      for (const entry of result.files) {
        const entryPath = `${path}/${entry.name}`;
        
        if (entry.type === 'directory') {
          // Recursively scan subdirectories
          await this.scanDirectory(entryPath, files);
        } else if (entry.type === 'file') {
          // Check if file is an audio file
          const extension = entry.name.split('.').pop()?.toLowerCase();
          if (extension && this.audioExtensions.includes(extension)) {
            // Get file stats
            const stats = await Filesystem.stat({
              path: entryPath,
              directory: Directory.ExternalStorage
            });
            
            // Create a unique ID for the file
            const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            
            // Add file to the list
            files.push({
              id,
              path: entryPath,
              uri: stats.uri,
              name: entry.name,
              title: this.getNameWithoutExtension(entry.name),
              size: stats.size,
              type: extension,
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${path}:`, error);
    }
  }

  /**
   * Gets audio file metadata
   */
  async getAudioMetadata(file: AudioFile): Promise<AudioFile> {
    // In a real app, you would use a media library plugin to extract metadata
    // For this example, we're just returning the file with some basic metadata
    
    // Using the filename as fallback metadata
    const updatedFile = { ...file };
    
    if (!file.title) {
      updatedFile.title = this.getNameWithoutExtension(file.name);
    }
    
    // In a real implementation, this would extract artist/album info
    // and album art from the file's metadata
    
    return updatedFile;
  }

  /**
   * Remove file extension from name
   */
  private getNameWithoutExtension(filename: string): string {
    return filename.replace(/\.[^/.]+$/, "");
  }

  /**
   * Creates a directory if it doesn't exist
   */
  async createDirectory(path: string): Promise<void> {
    try {
      // Check if directory exists first to avoid the "Current directory does already exist" error
      try {
        const result = await Filesystem.stat({
          path,
          directory: Directory.Documents
        });
        
        // If we get here, the directory exists
        console.log('Directory already exists:', path);
        return;
      } catch (e) {
        // Directory doesn't exist, create it
        await Filesystem.mkdir({
          path,
          directory: Directory.Documents,
          recursive: true
        });
        console.log('Created directory:', path);
      }
    } catch (error) {
      console.error('Error creating directory:', error);
      throw error;
    }
  }

  /**
   * Saves an audio file
   */
  async saveAudioFile(data: Blob, filename: string, directory: string): Promise<string> {
    try {
      // Create directory if it doesn't exist
      await this.createDirectory(directory);
      
      // Convert blob to base64
      const base64Data = await this.blobToBase64(data);
      
      // Save the file
      const result = await Filesystem.writeFile({
        path: `${directory}/${filename}`,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true
      });
      
      console.log('File saved successfully:', result.uri);
      return result.uri;
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  /**
   * Convert blob to base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        // Remove the prefix (e.g., "data:audio/mp3;base64,")
        const base64 = base64data.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
