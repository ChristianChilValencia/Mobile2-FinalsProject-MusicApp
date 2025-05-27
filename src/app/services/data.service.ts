import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { StorageService } from './storage.service';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';
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
  getPlaylistCoverArt(playlist: Playlist): string | PromiseLike<string | null> | null {
    // Return the playlist's cover art if it exists
    if (playlist.coverArt) {
      return playlist.coverArt;
    }

    // If there are no tracks, return null
    if (!playlist.trackIds?.length) {
      return null;  
    }

    // Try to get artwork from first track
    const firstTrack = this.tracksSubject.value.find(t => t.id === playlist.trackIds[0]);
    if (firstTrack?.artwork || firstTrack?.imageUrl) {
      return firstTrack.artwork || firstTrack.imageUrl;
    }

    return null;
  }

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
        
        // Initialize SQLite
        if (this.platform.is('hybrid')) {
          await this.sqlite.checkConnectionsConsistency();
          this.db = await this.sqlite.createConnection('harmony.db', false, 'no-encryption', 1, false);
        } else {
          await this.sqlite.initWebStore();
          this.db = await this.sqlite.createConnection('harmony.db', false, 'no-encryption', 1, false);
        }
        await this.db.open();

        const sql = `
          CREATE TABLE IF NOT EXISTS playlists (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            description  TEXT,
            cover_art    TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TRIGGER IF NOT EXISTS trg_playlists_updated
            AFTER UPDATE OF name, description, cover_art ON playlists
          BEGIN
            UPDATE playlists SET updated_at = datetime('now') WHERE id = NEW.id;
          END;

          CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id  TEXT NOT NULL,
            track_id     TEXT NOT NULL,
            position     INTEGER,
            PRIMARY KEY (playlist_id, track_id)
          );

          CREATE TABLE IF NOT EXISTS tracks (
            id           TEXT PRIMARY KEY,
            title        TEXT,
            artist       TEXT,
            album        TEXT,
            duration     INTEGER,
            image_url    TEXT,
            preview_url  TEXT,
            spotify_id   TEXT,
            liked        INTEGER DEFAULT 0,
            is_local     INTEGER DEFAULT 0,
            source       TEXT CHECK(source IN ('local', 'stream')) DEFAULT 'stream'
          );

          CREATE TABLE IF NOT EXISTS liked_music (
            track_id     TEXT PRIMARY KEY,
            liked_at     TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS downloaded_music (
            track_id     TEXT PRIMARY KEY,
            file_uri     TEXT NOT NULL,
            file_path    TEXT NOT NULL,
            downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
          );`;

        await this.db.execute(sql);
        
        // Load local tracks from SQLite
        if (this.platform.is('hybrid')) {
          const result = await this.db.query(`
            SELECT
              t.id,
              t.title,
              t.artist,
              t.album,
              t.duration,
              t.image_url    AS imageUrl,
              t.preview_url  AS previewUrl,
              t.spotify_id   AS spotifyId,
              t.liked,
              t.is_local     AS isLocal,
              t.source,
              dm.file_path   AS localPath
            FROM tracks t
            LEFT JOIN downloaded_music dm ON dm.track_id = t.id
            WHERE t.is_local = 1
          `);
          
          if (result.values) {
            const localTracks = result.values.map(row => ({
              id: row.id,
              title: row.title,
              artist: row.artist,
              album: row.album,
              duration: row.duration,
              imageUrl: row.imageUrl,
              previewUrl: row.previewUrl,
              spotifyId: row.spotifyId,
              liked: !!row.liked,
              isLocal: true,
              source: row.source as 'local' | 'stream',
              localPath: row.localPath
            }));
            
            // Merge local tracks with existing tracks
            const currentTracks = this.tracksSubject.value;
            const mergedTracks = [...currentTracks.filter(t => !t.isLocal), ...localTracks];
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
      const tracks = this.tracksSubject.value;      
      const localTrack: Track = {
        ...track,
        isLocal: true,
        source: 'local',
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
      
      // Save to Preferences for web/desktop
      await this.saveTracks(tracks);
      
      // Save to SQLite
      if (this.platform.is('hybrid')) {
        await this.ensureInit();
        
        // Save track data
        await this.db.run(
          `INSERT OR REPLACE INTO tracks (
            id, title, artist, album, duration,
            image_url, preview_url, spotify_id,
            liked, is_local, source
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
            1,
            'local'
          ]
        );
        
        // Save file path
        await this.db.run(
          `INSERT OR REPLACE INTO downloaded_music (
            track_id, file_uri, file_path, downloaded_at
          ) VALUES (?, ?, ?, ?);`,
          [
            localTrack.id,
            localTrack.previewUrl || '',
            filePath,
            new Date().toISOString()
          ]
        );
      }
    } catch (error) {
      console.error('Error saving local music:', error);
      throw error;
    }
  }
  async addToRecentlyPlayed(trackId: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;
      const track = tracks.find(t => t.id === trackId);
      
      if (!track) return;
      
      // Create a new array of recent tracks
      let recentTracks = await this.get('recently_played') || [];
      
      // Remove the track if it's already in the list to avoid duplicates
      recentTracks = recentTracks.filter((id: string) => id !== trackId);
      
      // Add the track ID to the beginning of the array
      recentTracks.unshift(trackId);
      
      // Limit to most recent 20 tracks
      if (recentTracks.length > 20) {
        recentTracks = recentTracks.slice(0, 20);
      }
      
      // Save the updated recent tracks
      await this.set('recently_played', recentTracks);
      
      // Update the track's lastPlayed timestamp
      track.lastPlayed = new Date().toISOString();
      this.tracksSubject.next([...tracks]);
      await this.saveTracks(tracks);
      
      // Update SQLite if on mobile
      if (this.platform.is('hybrid')) {
        await this.ensureInit();
        await this.db.run(
          `UPDATE tracks SET last_played = ? WHERE id = ?;`,
          [track.lastPlayed, trackId]
        );
      }
    } catch (error) {
      console.error('Error adding track to recently played:', error);
    }
  }async getRecentlyPlayedTracks(): Promise<Track[]> {
    try {
      const recentTrackIds = await this.get('recently_played') || [];
      const tracks = this.tracksSubject.value;
      
      // Get the track objects for the recent IDs, maintain order
      const recentTracks: Track[] = [];
      for (const id of recentTrackIds) {
        const track = tracks.find(t => t.id === id);
        if (track) {
          recentTracks.push(track);
        }
      }
      
      return recentTracks;
    } catch (error) {
      console.error('Error getting recently played tracks:', error);
      return [];
    }
  }
  async getAllTracks(): Promise<Track[]> {
    return this.tracksSubject.value;
  }

  async getTrack(id: string): Promise<Track | null> {
    const tracks = this.tracksSubject.value;
    return tracks.find(track => track.id === id) || null;
  }

  async loadTracks(): Promise<void> {
    try {
      const tracks = await this.get('tracks') || [];
      this.tracksSubject.next(tracks);
    } catch (error) {
      console.error('Error loading tracks:', error);
    }
  }

  async saveTracks(tracks: Track[]): Promise<void> {
    try {
      await this.set('tracks', tracks);
    } catch (error) {
      console.error('Error saving tracks:', error);
    }
  }

  // Playlist methods
  async getAllPlaylists(): Promise<Playlist[]> {
    return this.playlistsSubject.value;
  }

  async createPlaylist(name: string, description?: string): Promise<Playlist> {
    const playlists = this.playlistsSubject.value;
    const now = new Date().toISOString();
    
    const newPlaylist: Playlist = {
      id: uuidv4(),
      name,
      description,
      trackIds: [],
      createdAt: now,
      updatedAt: now
    };
    
    playlists.push(newPlaylist);
    this.playlistsSubject.next(playlists);
    await this.savePlaylists(playlists);
    
    return newPlaylist;
  }
  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlists = this.playlistsSubject.value;
    const playlist = playlists.find(p => p.id === playlistId);
    
    if (!playlist) {
      throw new Error(`Playlist with ID ${playlistId} not found`);
    }
    
    // Add track if not already in playlist
    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      playlist.updatedAt = new Date().toISOString();
      this.playlistsSubject.next([...playlists]);
      await this.savePlaylists(playlists);
    }
  }

  async getPlaylist(playlistId: string): Promise<Playlist | null> {
    const playlists = this.playlistsSubject.value;
    return playlists.find(p => p.id === playlistId) || null;
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    try {
      const playlists = this.playlistsSubject.value.filter(p => p.id !== playlistId);
      this.playlistsSubject.next(playlists);
      await this.savePlaylists(playlists);
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    try {
      const playlists = this.playlistsSubject.value;
      const playlist = playlists.find(p => p.id === playlistId);
      
      if (!playlist) {
        throw new Error(`Playlist with ID ${playlistId} not found`);
      }
      
      // Remove track if present in playlist
      const trackIndex = playlist.trackIds.indexOf(trackId);
      if (trackIndex !== -1) {
        playlist.trackIds.splice(trackIndex, 1);
        playlist.updatedAt = new Date().toISOString();
        this.playlistsSubject.next([...playlists]);
        await this.savePlaylists(playlists);
      }
    } catch (error) {
      console.error('Error removing track from playlist:', error);
      throw error;
    }
  }

  async updatePlaylistDetails(playlistId: string, name: string, description?: string, coverArt?: string): Promise<Playlist> {
    try {
      const playlists = this.playlistsSubject.value;
      const playlist = playlists.find(p => p.id === playlistId);
      
      if (!playlist) {
        throw new Error(`Playlist with ID ${playlistId} not found`);
      }
      
      // Update playlist details
      playlist.name = name;
      playlist.description = description;
      if (coverArt) {
        playlist.coverArt = coverArt;
      }
      playlist.updatedAt = new Date().toISOString();
      
      this.playlistsSubject.next([...playlists]);
      await this.savePlaylists(playlists);
      
      return playlist;
    } catch (error) {
      console.error('Error updating playlist details:', error);
      throw error;
    }
  }

  async loadPlaylists(): Promise<void> {
    try {
      const playlists = await this.get('playlists') || [];
      this.playlistsSubject.next(playlists);
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  }

  async savePlaylists(playlists: Playlist[]): Promise<void> {
    try {
      await this.set('playlists', playlists);
    } catch (error) {
      console.error('Error saving playlists:', error);
    }
  }

  async removeTrack(trackId: string): Promise<void> {
    try {
      // Remove from tracks list
      const tracks = this.tracksSubject.value.filter(t => t.id !== trackId);
      this.tracksSubject.next(tracks);
      await this.saveTracks(tracks);
      
      // Remove from any playlists
      const playlists = this.playlistsSubject.value;
      let playlistsChanged = false;
      
      playlists.forEach(playlist => {
        const initialLength = playlist.trackIds.length;
        playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
        
        if (playlist.trackIds.length !== initialLength) {
          playlist.updatedAt = new Date().toISOString();
          playlistsChanged = true;
        }
      });
      
      if (playlistsChanged) {
        this.playlistsSubject.next([...playlists]);
        await this.savePlaylists(playlists);
      }
    } catch (error) {
      console.error('Error removing track:', error);
      throw error;
    }
  }

  // Storage methods for key-value pairs
  async get(key: string): Promise<any> {
    try {
      const { value } = await Preferences.get({ key });
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    try {
      await Preferences.set({
        key,
        value: JSON.stringify(value)
      });
    } catch (error) {
      console.error(`Error setting ${key} in storage:`, error);
      throw error;
    }
  }
}


