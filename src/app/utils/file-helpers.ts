import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Manages file paths and URI conversions consistently across the app
 */
export class FileHelpers {
  /**
   * Convert a file path to the appropriate URI format based on platform
   */
  static getFileUri(path: string): string {
    if (Capacitor.isNativePlatform()) {
      return Capacitor.convertFileSrc(path);
    } else {
      return path;
    }
  }

  /**
   * Convert a file to base64 for storage
   */
  static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1] || base64String;
        resolve(base64Data);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert base64 string to a Blob
   */
  static base64ToBlob(base64: string, mimeType: string = 'audio/mpeg'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Create a directory if it doesn't exist
   */
  static async ensureDirectory(path: string, directory: Directory = Directory.Data): Promise<void> {
    try {
      await Filesystem.mkdir({
        path,
        directory,
        recursive: true
      });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('exists'))) {
        throw error;
      }
    }
  }

  /**
   * Get file extension from File object or filename
   */
  static getFileExtension(file: File | string): string {
    const filename = typeof file === 'string' ? file : file.name;
    return filename.split('.').pop()?.toLowerCase() || 'mp3';
  }
}
