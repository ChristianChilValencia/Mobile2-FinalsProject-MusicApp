import { Injectable } from '@angular/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private rootDir: Directory;

  constructor(private platform: Platform) {
    // Use different directories based on platform
    this.rootDir = this.platform.is('ios') || this.platform.is('android') 
      ? Directory.Data 
      : Directory.Documents;
  }
  async writeFile(fileName: string, data: File | Blob): Promise<string> {
    try {
      // Create the music directory if it doesn't exist
      await this.createMusicDirectory();

      let base64Data: string;
      
      if (data instanceof File) {
        // Convert File to ArrayBuffer then to base64
        const arrayBuffer = await data.arrayBuffer();
        base64Data = btoa(
          new Uint8Array(arrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
      } else {
        // Convert Blob to base64
        base64Data = await this.blobToBase64(data);
      }

      // Save the file
      const result = await Filesystem.writeFile({
        path: `music/${fileName}`,
        data: base64Data,
        directory: this.rootDir,
        recursive: true
      });

      // Return platform-appropriate URI
      if (this.platform.is('hybrid')) {
        return Capacitor.convertFileSrc(result.uri);
      } else {
        const blob = await this.readFile(`music/${fileName}`);
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error('Error writing file:', error);
      throw error;
    }
  }

  async readFile(filePath: string): Promise<Blob> {
    try {
      const result = await Filesystem.readFile({
        path: filePath,
        directory: this.rootDir
      });

      // Convert base64 to Blob
      if (typeof result.data === 'string') {
        return this.base64ToBlob(result.data);
      }
      throw new Error('File data is not in expected format');
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: filePath,
        directory: this.rootDir
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  async listFiles(directory: string = 'music'): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({
        path: directory,
        directory: this.rootDir
      });
        return result.files.map(file => file.uri || file.name);
    } catch (error) {
      console.error('Error listing files:', error);
      if (error instanceof Error && error.message.includes('Directory does not exist')) {
        return [];
      }
      throw error;
    }
  }  private async createMusicDirectory(): Promise<void> {
    try {
      // First check if the directory exists
      try {
        await Filesystem.readdir({
          path: 'music',
          directory: this.rootDir
        });
        // Directory already exists, no need to create it
        return;
      } catch (err) {
        // Directory doesn't exist, continue to create it
      }
      
      // Create the directory
      await Filesystem.mkdir({
        path: 'music',
        directory: this.rootDir,
        recursive: true
      });
    } catch (error: unknown) {
      // Handle any other errors
      if (error instanceof Error && error.message.includes('Current directory does already exist')) {
        // This is fine, directory exists
        return;
      } else if (error instanceof Error) {
        console.error('Error creating directory:', error);
        throw error;
      } else {
        console.error('Unknown error creating directory:', error);
        throw new Error('Failed to create music directory');
      }
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix if present
        const base64Data = base64String.split(',')[1] || base64String;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private base64ToBlob(base64: string, contentType: string = ''): Blob {
    const sliceSize = 512;
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  }
}
