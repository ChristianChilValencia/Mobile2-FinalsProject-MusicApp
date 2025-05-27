import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { StorageService } from './storage.service';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject, Observable } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection
} from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Import and re-export Track interface from shared models
import { Track } from '../models/track.model';
export { Track } from '../models/track.model';

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
  private sqlite: SQLiteConnection;
  private db!: SQLiteDBConnection;
  private _initPromise: Promise<void> | null = null;
  
  tracks$ = this.tracksSubject.asObservable();
  playlists$ = this.playlistsSubject.asObservable();
  
  constructor(
    private storageService: StorageService,
    private platform: Platform
  ) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.loadTracks();
    this.loadPlaylists();
  }

  async ensureInit(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    
    this._initPromise = (async () => {
      try {
        await this.platform.ready();
        
        // Initialize SQLite for hybrid (mobile) platforms
        if (this.platform.is('hybrid')) {
          await this.sqlite.checkConnectionsConsistency();
          this.db = await this.sqlite.createConnection('harmony.db', false, 'no-encryption', 1, false);
          await this.db.open();

          const sql = `
            CREATE TABLE IF NOT EXISTS local_tracks (
              id           TEXT PRIMARY KEY,
              title        TEXT,
              artist       TEXT,
              album        TEXT,
              duration     INTEGER,
              image_url    TEXT,
              preview_url  TEXT,
              spotify_id   TEXT,
              liked        INTEGER DEFAULT 0,
              is_local     INTEGER DEFAULT 1,
              source       TEXT CHECK(source IN ('local', 'stream')) DEFAULT 'local',
              local_path   TEXT
            );`;

          await this.db.execute(sql);
          
          // Load local tracks from SQLite
          const result = await this.db.query(`SELECT * FROM local_tracks`);
          if (result.values) {
            const localTracks = result.values.map(row => ({
              id: row.id,
              title: row.title,
              artist: row.artist,
              album: row.album,
              duration: row.duration,
              imageUrl: row.image_url,
              previewUrl: row.preview_url,
              spotifyId: row.spotify_id,
              liked: !!row.liked,
              isLocal: true,              source: 'local' as const,
              localPath: row.local_path
            }));
            
            // Merge local tracks with existing tracks
            const currentTracks = this.tracksSubject.value;
            const mergedTracks = [...currentTracks.filter(t => t.source !== 'local'), ...localTracks] as Track[];
            this.tracksSubject.next(mergedTracks);
          }
        }
      } catch (error) {
        console.error('Error in ensureInit:', error);
        throw error;
      }
    })();
    
    return this._initPromise;
  }

  // Track methods
  async saveLocalMusic(track: Track, filePath: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;      const localTrack: Track = {
        ...track,
        isLocal: true,
        source: 'local' as const,
        localPath: filePath
      };

      // If track already exists, update it, otherwise add new
      const existingIndex = tracks.findIndex(t => t.id === track.id);
      if (existingIndex >= 0) {
        tracks[existingIndex] = localTrack;
      } else {
        tracks.push(localTrack);
      }
      
      // Update in-memory state
      this.tracksSubject.next(tracks);
      
      // Save to Preferences
      await this.saveTracks(tracks);
      
      // If on mobile, also save to SQLite
      if (this.platform.is('hybrid')) {
        await this.ensureInit();
        await this.db.run(
          `INSERT OR REPLACE INTO local_tracks (
            id, title, artist, album, duration,
            image_url, preview_url, spotify_id,
            liked, source, local_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            localTrack.id,
            localTrack.title,
            localTrack.artist,
            localTrack.album,
            localTrack.duration,
            localTrack.imageUrl,
            localTrack.previewUrl,
            localTrack.spotifyId,
            localTrack.liked ? 1 : 0,
            localTrack.source,
            localTrack.localPath
          ]
        );
      }
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
      
      if (track && track.source === 'local' && track.localPath) {
        // Delete the actual file
        await this.storageService.deleteFile(track.localPath);
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


