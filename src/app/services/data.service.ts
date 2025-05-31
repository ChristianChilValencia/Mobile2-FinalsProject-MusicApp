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
    // If the playlist has a coverArt, return it
    if (playlist.coverArt) {
      return playlist.coverArt;
    }
    
    // If the playlist has tracks, use the artwork of the first track
    if (playlist.trackIds.length > 0) {
      const firstTrackId = playlist.trackIds[0];
      const track = this.tracksSubject.value.find(t => t.id === firstTrackId);
      return track?.artwork || track?.imageUrl || 'assets/placeholder-playlist.png';
    }
    
    // Fallback to placeholder
    return 'assets/placeholder-playlist.png';
  }

  private tracksSubject = new BehaviorSubject<Track[]>([]);
  private playlistsSubject = new BehaviorSubject<Playlist[]>([]);
  private recentlyPlayedSubject = new BehaviorSubject<Track[]>([]);
  private sqlite: SQLiteConnection;
  private db!: SQLiteDBConnection;
  private _initPromise: Promise<void> | null = null;
  
  tracks$ = this.tracksSubject.asObservable();
  playlists$ = this.playlistsSubject.asObservable();
  recentlyPlayed$ = this.recentlyPlayedSubject.asObservable();
  
  constructor(
    private storageService: StorageService,
    private platform: Platform
  ) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.loadTracks();
    this.loadPlaylists();
    
    // Initialize recently played tracks
    this.initRecentlyPlayed();
  }

  // Add a method to run database migrations
  private async runDatabaseMigrations(): Promise<void> {
    try {
      if (!this.db) {
        console.error('Database not initialized');
        return;
      }

      console.log('Running database migrations...');
      
      // Check if last_played column exists
      const tableInfo = await this.db.query("PRAGMA table_info(tracks);");
      const columns = tableInfo.values || [];
      const columnNames = columns.map((col: any) => col.name);
      
      // Add last_played column if it doesn't exist
      if (!columnNames.includes('last_played')) {
        console.log('Adding last_played column to tracks table');
        await this.db.execute('ALTER TABLE tracks ADD COLUMN last_played TEXT;');
      }
      
      // Add added_at column if it doesn't exist
      if (!columnNames.includes('added_at')) {
        console.log('Adding added_at column to tracks table');
        await this.db.execute('ALTER TABLE tracks ADD COLUMN added_at TEXT;');
      }
      
      console.log('Database migrations completed');
    } catch (error) {
      console.error('Error running database migrations:', error);
    }
  }

  // Initialize recently played tracks from storage
  private async initRecentlyPlayed(): Promise<void> {
    try {
      const recentTracks = await this.getRecentlyPlayedTracks();
      this.recentlyPlayedSubject.next(recentTracks);
    } catch (error) {
      console.error('Error initializing recently played tracks:', error);
    }
  }

  async ensureInit(): Promise<void> {
    if (this._initPromise) return this._initPromise;        this._initPromise = (async () => {
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

        // First, create tables if they don't exist
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
            source       TEXT CHECK(source IN ('local', 'stream')) DEFAULT 'stream',
            last_played  TEXT,
            added_at     TEXT
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
        
        // Run database migration to add missing columns if they don't exist
        await this.runDatabaseMigrations();
        
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
            liked, is_local, source, added_at, last_played
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
            'local',
            localTrack.addedAt || new Date().toISOString(),
            localTrack.lastPlayed || null
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
  }  async addToRecentlyPlayed(trackId: string): Promise<void> {
    if (!trackId) {
      console.error('Invalid trackId provided to addToRecentlyPlayed');
      return;
    }
    
    try {
      console.log('DataService - Adding track to recently played:', trackId);
      
      // Get current tracks
      const tracks = this.tracksSubject.value;
      let track = tracks.find(t => t.id === trackId);

      // For Deezer tracks, do additional verification and ensure all required fields are set
      if (trackId.startsWith('deezer-')) {
        console.log(`Verifying Deezer track ${trackId} before adding to history`);
        
        // First check if track exists in collection
        if (!track) {
          console.error(`Deezer track ${trackId} not found in collection. Cannot add to history.`);
          throw new Error(`Track must be saved to collection before adding to history: ${trackId}`);
        }

        // Ensure track has all required fields
        const updatedTrack: Track = {          ...track,
          source: 'stream', // Always set stream for Deezer tracks
          addedAt: track.addedAt || new Date().toISOString(),
          artist: track.artist || 'Unknown Artist',
          title: track.title || 'Unknown Title',
          artwork: track.artwork || 'assets/placeholder-player.png'
        };

        // Save the updated track back to collection
        const updatedTracks = tracks.map(t => t.id === trackId ? updatedTrack : t);
        await this.saveTracks(updatedTracks);
        track = updatedTrack; // Update the reference
        console.log(`Updated Deezer track ${trackId} with source = stream`);
      }

      // Make sure we still have a valid track
      if (!track) {
        console.error(`Track with ID ${trackId} not found in tracks collection.`);
        throw new Error(`Track with ID ${trackId} must be in collection before adding to history.`);
      }

      // Update the track's lastPlayed timestamp
      const updatedTrack: Track = {
        ...track,
        lastPlayed: new Date().toISOString()
      };
      console.log(`Updated lastPlayed for ${updatedTrack.title} to ${updatedTrack.lastPlayed}`);

      // Update the tracks collection
      const freshTracks = tracks.map(t => t.id === trackId ? updatedTrack : t);
      this.tracksSubject.next(freshTracks);
      await this.saveTracks(freshTracks);      // Update SQLite if on mobile
      if (this.platform.is('hybrid')) {
        try {
          await this.ensureInit();
          
          // Make sure the last_played column exists
          await this.runDatabaseMigrations();
          
          // Update the last_played field
          await this.db.run(
            `UPDATE tracks SET last_played = ? WHERE id = ?;`,
            [updatedTrack.lastPlayed, trackId]
          );
          console.log(`Successfully updated last_played in database for track ${trackId}`);
        } catch (error) {
          // Handle the error but don't fail the whole operation
          console.error('Error updating last_played in database:', error);
          // Continue with the rest of the function
        }
      }

      // Get current recently played IDs
      let recentTracks = await this.get('recently_played') || [];
      console.log('Current recently played IDs:', recentTracks);

      // Remove the track if it's already in the list (avoid duplicates)
      recentTracks = recentTracks.filter((id: string) => id !== trackId);

      // Add the track ID to the beginning of the array
      recentTracks.unshift(trackId);

      // Limit to most recent 20 tracks
      recentTracks = recentTracks.slice(0, 20);
      console.log('Updated recently played IDs:', recentTracks);

      // Save the updated recent tracks
      await this.set('recently_played', recentTracks);

      // Update the recentlyPlayedSubject with fresh data
      const updatedRecentTracks = await this.getRecentlyPlayedTracks();
      this.recentlyPlayedSubject.next(updatedRecentTracks);

      console.log(`Successfully added track to history: ${updatedRecentTracks.length} tracks in history`);
    } catch (error) {
      console.error('Error adding track to recently played:', error);
      throw error; // Re-throw the error since this is a critical operation
    }
  }
  async getRecentlyPlayedTracks(): Promise<Track[]> {
    try {
      const recentTrackIds = await this.get('recently_played') || [];
      console.log('DataService - Getting recently played tracks, IDs:', recentTrackIds);
      
      const tracks = this.tracksSubject.value;
      console.log('Total tracks in collection:', tracks.length);
      
      // Get the track objects for the recent IDs, maintain order
      const recentTracks: Track[] = [];
      for (const id of recentTrackIds) {
        const track = tracks.find(t => t.id === id);
        if (track) {
          recentTracks.push(track);
        } else {
          console.warn(`Track with ID ${id} is in recently played but not found in tracks collection`);
        }
      }
      
      console.log('Found', recentTracks.length, 'recently played tracks');
      return recentTracks;
    } catch (error) {
      console.error('Error getting recently played tracks:', error);
      return [];
    }
  }
    // Method to force refresh recently played tracks
  async refreshRecentlyPlayed(): Promise<void> {
    try {
      console.log('DataService - Force refreshing recently played tracks');
      const recentTracks = await this.getRecentlyPlayedTracks();
      
      // Log each track to help with debugging
      if (recentTracks.length > 0) {
        console.log('Recently played tracks:');
        recentTracks.forEach((track, index) => {
          console.log(`${index + 1}. ${track.title} by ${track.artist} (ID: ${track.id}, Last played: ${track.lastPlayed})`);
        });
      } else {
        console.log('No recently played tracks found');
      }
      
      this.recentlyPlayedSubject.next(recentTracks);
      console.log('Refreshed recently played tracks:', recentTracks.length);
    } catch (error) {
      console.error('Error refreshing recently played tracks:', error);
    }
  }

  // Additional methods for track and playlist operations
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
  }  // Add a method to reset the database in case of corruption
  async resetDatabase(): Promise<void> {
    try {
      if (!this.platform.is('hybrid')) {
        console.log('Reset database only applies to mobile platforms');
        return;
      }
      
      console.log('Attempting to reset database...');
      
      // Close any existing connection
      if (this.db) {
        try {
          await this.db.close();
          console.log('Database connection closed');
        } catch (err) {
          console.error('Error closing db connection:', err);
        }
      }
      
      // Force a clean initialization
      this._initPromise = null;
      await this.ensureInit();
      
      // Run migrations to ensure all columns exist
      await this.runDatabaseMigrations();
      
      console.log('Database reset completed');
      
      // Reload data
      await this.loadTracks();
      await this.loadPlaylists();
      await this.initRecentlyPlayed();
    } catch (error) {
      console.error('Error resetting database:', error);
      throw error;
    }
  }

  async saveTracks(tracks: Track[]): Promise<void> {
    try {
      await this.set('tracks', tracks);
    } catch (error) {
      console.error('Error saving tracks:', error);
    }
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    return this.playlistsSubject.value;
  }

  async getPlaylist(playlistId: string): Promise<Playlist | null> {
    const playlists = this.playlistsSubject.value;
    return playlists.find(p => p.id === playlistId) || null;
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
    this.playlistsSubject.next([...playlists]);
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

      // Also update recently played if needed
      const recentTracks = await this.getRecentlyPlayedTracks();
      if (recentTracks.some(t => t.id === trackId)) {
        // The track was in recently played, so we need to update
        let recentIds = await this.get('recently_played') || [];
        recentIds = recentIds.filter((id: string) => id !== trackId);
        await this.set('recently_played', recentIds);
        
        // Update the recentlyPlayedSubject
        const updatedRecentTracks = await this.getRecentlyPlayedTracks();
        this.recentlyPlayedSubject.next(updatedRecentTracks);
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
