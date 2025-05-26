import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { v4 as uuidv4 } from 'uuid';
import { DataService, Track } from '../../services/data.service';
import { StorageService } from '../../services/storage.service';
import { MediaPlayerService } from '../../services/media-player.service';

interface PendingUpload {
  file: File;
  progress: number;
  status: string;
}

@Component({
  selector: 'app-uploads',
  templateUrl: './uploads.page.html',
  styleUrls: ['./uploads.page.scss'],
  standalone: false
})
export class UploadsPage implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  isDragging = false;
  pendingUploads: PendingUpload[] = [];
  recentlyAddedTracks: Track[] = [];
  
  // Supported audio formats
  private readonly supportedFormats = [
    'audio/mpeg', // .mp3
    'audio/mp4', // .m4a, .aac
    'audio/wav', // .wav
    'audio/ogg', // .ogg, .opus
    'audio/flac', // .flac
    'audio/aac' // .aac
  ];

  constructor(
    private storageService: StorageService,
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadRecentlyAddedTracks();
  }

  async loadRecentlyAddedTracks() {
    const allTracks = await this.dataService.getLocalTracks();
    // Sort by added date (newest first) and take the first 10
    this.recentlyAddedTracks = allTracks
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
      .slice(0, 10);
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    
    if (event.dataTransfer?.files) {
      this.processFiles(event.dataTransfer.files);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processFiles(input.files);
    }
  }

  processFiles(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check if the file is an audio file
      if (!this.isAudioFile(file)) {
        this.showToast(`Skipping unsupported file: ${file.name}`, 'warning');
        continue;
      }
      
      // Add to pending uploads
      this.pendingUploads.push({
        file,
        progress: 0,
        status: 'Preparing...'
      });
      
      // Process the file
      this.processAudioFile(file, this.pendingUploads.length - 1);
    }
  }

  async processAudioFile(file: File, uploadIndex: number) {
    try {
      // Update status
      this.updateUploadStatus(uploadIndex, 'Reading file...', 0.1);
      
      // Create a unique ID for the track
      const trackId = uuidv4();
      
      // Generate a safe filename
      const fileExt = file.name.split('.').pop() || 'mp3';
      const fileName = `${trackId}.${fileExt}`;
      
      // Extract metadata (if available)
      const metadata = await this.extractMetadata(file);
      
      // Update status
      this.updateUploadStatus(uploadIndex, 'Storing file...', 0.4);
      
      // Store the file
      const filePath = await this.storageService.writeFile(fileName, file);
      
      // Update status
      this.updateUploadStatus(uploadIndex, 'Creating track...', 0.8);
      
      // Create track object
      const track: Track = {
        id: trackId,
        title: metadata.title || file.name.replace(`.${fileExt}`, ''),
        artist: metadata.artist || 'Unknown Artist',
        album: metadata.album || 'Unknown Album',
        duration: metadata.duration || 0,
        imageUrl: metadata.artwork || 'assets/placeholder-album.png',
        previewUrl: filePath,
        spotifyId: '',
        liked: false,
        isLocal: true,
        source: 'local',
        pathOrUrl: filePath,
        addedAt: new Date().toISOString(),
        artwork: metadata.artwork || null,
        type: fileExt,
        localPath: filePath
      };
      
      // Save track in data service
      await this.dataService.saveLocalMusic(track, filePath);
      
      // Update status
      this.updateUploadStatus(uploadIndex, 'Completed', 1);
      
      // Remove from pending after a delay
      setTimeout(() => {
        this.pendingUploads.splice(uploadIndex, 1);
      }, 2000);
      
      // Refresh recently added
      await this.loadRecentlyAddedTracks();
      
      // Show success message
      this.showToast(`Added: ${track.title}`, 'success');
    } catch (error) {
      console.error('Error processing audio file:', error);
      this.updateUploadStatus(uploadIndex, 'Failed', 0);
      this.showToast(`Failed to process ${file.name}`, 'danger');
    }
  }

  updateUploadStatus(index: number, status: string, progress: number) {
    if (index >= 0 && index < this.pendingUploads.length) {
      this.pendingUploads[index].status = status;
      this.pendingUploads[index].progress = progress;
    }
  }

  async extractMetadata(file: File): Promise<{
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
        // Get duration
        const duration = audio.duration;
        
        // For now, we'll return basic metadata
        // In a real app, you'd use a library like jsmediatags to extract ID3 tags
        resolve({
          duration
        });
        
        // Clean up
        URL.revokeObjectURL(url);
      });
      
      audio.addEventListener('error', () => {
        console.error('Error loading audio for metadata extraction');
        resolve({});
        URL.revokeObjectURL(url);
      });
      
      // Load the audio
      audio.src = url;
      audio.load();
    });
  }

  isAudioFile(file: File): boolean {
    // Check by MIME type if available
    if (this.supportedFormats.includes(file.type)) {
      return true;
    }
    
    // Fallback to extension check
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    return ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac'].includes(extension);
  }

  playTrack(track: Track) {
    this.mediaPlayerService.setQueue([track], 0);
  }

  async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color
    });
    
    await toast.present();
  }
}
