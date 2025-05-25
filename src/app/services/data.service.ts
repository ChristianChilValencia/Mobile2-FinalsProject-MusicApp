import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject, Observable } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

// Define Track and Playlist interfaces directly in the service
export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string | null;
  duration?: number;
  pathOrUrl: string;
  source: 'local' | 'stream';
  addedAt: string;
  type?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  coverArt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  currentIndex: number;
  isShuffleActive: boolean;
  repeatMode: RepeatMode;
}

export enum RepeatMode {
  None = 'none',
  One = 'one',
  All = 'all'
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private tracksSubject = new BehaviorSubject<Track[]>([]);
  private playlistsSubject = new BehaviorSubject<Playlist[]>([]);
  
  tracks$ = this.tracksSubject.asObservable();
  playlists$ = this.playlistsSubject.asObservable();
  
  constructor(private storageService: StorageService) {
    this.loadTracks();
    this.loadPlaylists();
  }

  // Track methods
  async saveLocalMusic(track: Track, filePath: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;
      // If track already exists, update it, otherwise add new
      const existingIndex = tracks.findIndex(t => t.id === track.id);
      
      if (existingIndex >= 0) {
        tracks[existingIndex] = { ...track };
      } else {
        tracks.push(track);
      }
      
      this.tracksSubject.next(tracks);
      await this.saveTracks(tracks);
    } catch (error) {
      console.error('Error saving local music:', error);
      throw error;
    }
  }

  async getTrack(id: string): Promise<Track | null> {
    const tracks = this.tracksSubject.value;
    return tracks.find(track => track.id === id) || null;
  }

  async getAllTracks(): Promise<Track[]> {
    return this.tracksSubject.value;
  }

  async getLocalTracks(): Promise<Track[]> {
    return this.tracksSubject.value.filter(track => track.source === 'local');
  }

  async getStreamTracks(): Promise<Track[]> {
    return this.tracksSubject.value.filter(track => track.source === 'stream');
  }

  async removeTrack(id: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;
      const track = tracks.find(t => t.id === id);
      
      if (track && track.source === 'local') {
        // Delete the actual file
        await this.storageService.deleteFile(track.pathOrUrl);
      }
      
      // Update tracks array
      const updatedTracks = tracks.filter(t => t.id !== id);
      this.tracksSubject.next(updatedTracks);
      await this.saveTracks(updatedTracks);
      
      // Remove track from playlists
      const playlists = this.playlistsSubject.value;
      let playlistsUpdated = false;
      
      for (const playlist of playlists) {
        const trackIndex = playlist.trackIds.indexOf(id);
        if (trackIndex >= 0) {
          playlist.trackIds.splice(trackIndex, 1);
          playlist.updatedAt = new Date().toISOString();
          playlistsUpdated = true;
        }
      }
      
      if (playlistsUpdated) {
        this.playlistsSubject.next(playlists);
        await this.savePlaylists(playlists);
      }
    } catch (error) {
      console.error('Error removing track:', error);
      throw error;
    }
  }

  // Playlist methods
  async createPlaylist(name: string, description?: string): Promise<Playlist> {
    const newPlaylist: Playlist = {
      id: uuidv4(),
      name,
      description,
      trackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const playlists = [...this.playlistsSubject.value, newPlaylist];
    this.playlistsSubject.next(playlists);
    await this.savePlaylists(playlists);
    
    return newPlaylist;
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    return this.playlistsSubject.value.find(playlist => playlist.id === id) || null;
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    return this.playlistsSubject.value;
  }

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlists = this.playlistsSubject.value;
    const playlist = playlists.find(p => p.id === playlistId);
    
    if (!playlist) {
      throw new Error('Playlist not found');
    }
    
    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      playlist.updatedAt = new Date().toISOString();
      
      this.playlistsSubject.next(playlists);
      await this.savePlaylists(playlists);
    }
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlists = this.playlistsSubject.value;
    const playlist = playlists.find(p => p.id === playlistId);
    
    if (!playlist) {
      throw new Error('Playlist not found');
    }
    
    const trackIndex = playlist.trackIds.indexOf(trackId);
    if (trackIndex >= 0) {
      playlist.trackIds.splice(trackIndex, 1);
      playlist.updatedAt = new Date().toISOString();
      
      this.playlistsSubject.next(playlists);
      await this.savePlaylists(playlists);
    }
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    const playlists = this.playlistsSubject.value.filter(p => p.id !== playlistId);
    this.playlistsSubject.next(playlists);
    await this.savePlaylists(playlists);
  }

  async updatePlaylistDetails(playlistId: string, name: string, description?: string): Promise<void> {
    const playlists = this.playlistsSubject.value;
    const playlist = playlists.find(p => p.id === playlistId);
    
    if (!playlist) {
      throw new Error('Playlist not found');
    }
    
    playlist.name = name;
    playlist.description = description;
    playlist.updatedAt = new Date().toISOString();
    
    this.playlistsSubject.next(playlists);
    await this.savePlaylists(playlists);
  }

  // Storage helpers
  private async loadTracks(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'tracks' });
      if (value) {
        const tracks = JSON.parse(value) as Track[];
        this.tracksSubject.next(tracks);
      }
    } catch (error) {
      console.error('Error loading tracks:', error);
      // If there's an error, start with empty tracks
      this.tracksSubject.next([]);
    }
  }

  private async saveTracks(tracks: Track[]): Promise<void> {
    await Preferences.set({
      key: 'tracks',
      value: JSON.stringify(tracks)
    });
  }
  private async loadPlaylists(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'playlists' });
      if (value) {
        const playlists = JSON.parse(value) as Playlist[];
        this.playlistsSubject.next(playlists);
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
      // If there's an error, start with empty playlists
      this.playlistsSubject.next([]);
    }
  }

  async savePlaylists(playlists: Playlist[]): Promise<void> {
    await Preferences.set({
      key: 'playlists',
      value: JSON.stringify(playlists)
    });
  }
}
