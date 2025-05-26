import { Injectable } from '@angular/core';
import { Filesystem, Directory, FilesystemDirectory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Track } from './media-player.service';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root'
})
export class MediaScannerService {
  private supportedFormats = [
    '.m4a', '.aac',  // AAC
    '.mp3',          // MP3
    '.wav',          // WAV
    '.ogg',          // OGG
    '.flac',         // FLAC
    '.opus'          // Opus
  ];

  constructor(
    private platform: Platform,
    private dataService: DataService
  ) {}

  async scanDeviceForMusic(): Promise<Track[]> {
    if (!this.platform.is('android')) {
      console.warn('Media scanning is only supported on Android');
      return [];
    }

    try {
      // Request permissions first
      await this.requestPermissions();
      
      // Get standard music directories
      const musicDirs = await this.getMusicDirectories();
      
      const tracks: Track[] = [];
      
      // Scan each directory
      for (const dir of musicDirs) {
        try {
          // Get files in the directory (non-recursive)
          const result = await Filesystem.readdir({
            path: dir,
            directory: Directory.ExternalStorage
          });
          
          // Process each item (could be file or directory)
          for (const item of result.files) {
            // Check if it's a music file
            if (this.isAudioFile(item.name)) {
              // Construct full path for the file
              const filePath = `${dir}/${item.name}`;
              
              try {
                const track = await this.processAudioFile(filePath);
                if (track) {
                  tracks.push(track);
                  await this.dataService.saveLocalMusic(track, filePath);
                }
              } catch (fileError) {
                console.warn(`Error processing file ${item.name}:`, fileError);
              }
            }
            
            // If it's a directory, we could process it recursively
            // (but we'll keep it simple for now)
          }
        } catch (dirError) {
          console.warn(`Error reading directory ${dir}:`, dirError);
          // Continue with next directory
        }
      }
      
      return tracks;
    } catch (error) {
      console.error('Error scanning for music files:', error);
      throw error;
    }
  }

  private async requestPermissions(): Promise<void> {
    try {
      await Filesystem.requestPermissions();
    } catch (e) {
      console.error('Error requesting permissions:', e);
      throw e;
    }
  }

  private async getMusicDirectories(): Promise<string[]> {
    // On Android, typical music directories
    return [
      'Music',
      'Download',
      'DCIM/Audio'
    ];
  }

  private isAudioFile(filename: string): boolean {
    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return this.supportedFormats.includes(extension);
  }

  private async processAudioFile(path: string): Promise<Track | null> {
    try {
      // Extract basic metadata from filename
      const fileName = this.getFilenameFromPath(path);
      
      // Create Track object with basic info
      const track: Track = {
        id: `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        title: fileName,
        artist: 'Unknown Artist',
        album: 'Local Music',
        duration: 0, // Will be determined on first play
        imageUrl: 'assets/music-bg.png',
        previewUrl: path,
        spotifyId: '',
        liked: false,
        isLocal: true,
        localPath: path
      };
      
      // Try to extract artist from filename if it contains a dash
      if (fileName.includes(' - ')) {
        const parts = fileName.split(' - ');
        if (parts.length >= 2) {
          track.artist = parts[0].trim();
          track.title = parts[1].trim();
        }
      }
      
      return track;
    } catch (error) {
      console.error('Error processing audio file:', error);
      return null;
    }
  }

  private getFilenameFromPath(path: string): string {
    const parts = path.split('/');
    const filenameWithExt = parts[parts.length - 1];
    return filenameWithExt.replace(/\.[^/.]+$/, ''); // Remove extension
  }
  
  // For scanning subdirectories (optional enhancement)
  private async scanDirectoryRecursively(dirPath: string, tracks: Track[]): Promise<void> {
    try {
      const result = await Filesystem.readdir({
        path: dirPath,
        directory: Directory.ExternalStorage
      });
      
      for (const item of result.files) {
        const itemPath = `${dirPath}/${item.name}`;
        
        if (this.isAudioFile(item.name)) {
          // It's a music file
          try {
            const track = await this.processAudioFile(itemPath);
            if (track) {
              tracks.push(track);
              await this.dataService.saveLocalMusic(track, itemPath);
            }
          } catch (fileError) {
            console.warn(`Error processing file ${item.name}:`, fileError);
          }
        } else if (item.type === 'directory') {
          // It's a subdirectory, scan it recursively
          await this.scanDirectoryRecursively(itemPath, tracks);
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${dirPath}:`, error);
    }
  }
}