import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
// Commented out for now - will uncomment when ready to use real file access
// import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';

export interface AudioFile {
  id: string;
  title: string;
  artist: string;
  album?: string;
  path: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private readonly MOCK_MODE = true; // Set to false when ready to use real file access

  constructor(private platform: Platform) { }

  /**
   * Get list of audio files
   */
  getAudioFiles(): Observable<AudioFile[]> {
    if (this.MOCK_MODE) {
      return this.getMockAudioFiles();
    } else {
      return this.getRealAudioFiles();
    }
  }

  /**
   * Get mock audio files from assets folder
   */
  private getMockAudioFiles(): Observable<AudioFile[]> {
    // Mock data using the files from assets/audio
    const mockFiles: AudioFile[] = [
      {
        id: '1',
        title: 'Sample MP3 Track',
        artist: 'Demo Artist',
        album: 'Sample Album',
        path: 'assets/audio/mp3_sample.mp3',
      },
      {
        id: '2',
        title: 'Sample M4A Track',
        artist: 'Demo Artist 2',
        album: 'Sample Album 2',
        path: 'assets/audio/m4a_sample.m4a',
      }
    ];
    
    return of(mockFiles);
  }

  /**
   * Get real audio files from device storage
   * TO BE IMPLEMENTED LATER
   */
  private getRealAudioFiles(): Observable<AudioFile[]> {
    return new Observable(observer => {
      // This will be implemented later with Capacitor Filesystem
      // For example:
      // this.listAudioFilesFromDirectory('/path/to/music')
      //   .then(files => {
      //     observer.next(files);
      //     observer.complete();
      //   })
      //   .catch(err => observer.error(err));
      
      // For now, just return mock files
      observer.next([]);
      observer.complete();
    });
  }

  /**
   * Get single audio file by ID
   */
  getAudioFileById(id: string): Observable<AudioFile | undefined> {
    return new Observable(observer => {
      this.getAudioFiles().subscribe(files => {
        const file = files.find(f => f.id === id);
        observer.next(file);
        observer.complete();
      });
    });
  }

  /**
   * List audio files from a specific directory
   * TO BE USED IN THE FUTURE
   */  private async listAudioFilesFromDirectory(path: string): Promise<AudioFile[]> {
    try {
      // Check if we're on a native platform
      if (!this.platform.is('capacitor')) {
        console.warn('Not running on a native platform. Cannot access filesystem.');
        return [];
      }

      // Commented out for now - will uncomment when ready to use real file access
      // const result = await Filesystem.readdir({
      //   path,
      //   directory: Directory.Documents
      // });

      const audioFiles: AudioFile[] = [];
      
      // Process files (filter by audio extensions, etc.)
      // Code to be added later
      
      return audioFiles;
    } catch (e) {
      console.error('Error accessing filesystem:', e);
      return [];
    }
  }
}
