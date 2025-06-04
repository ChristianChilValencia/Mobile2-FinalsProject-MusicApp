import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection
} from '@capacitor-community/sqlite';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  previewUrl: string;
  isLocal: boolean;
  localPath?: string;
  source?: 'local' | 'stream';
  addedAt?: string;
  lastPlayed?: string;
  type?: string;
  artwork?: string | null;
  pathOrUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  coverArt?: string;
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
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  getPlaylistCoverArt(playlist: Playlist): string | PromiseLike<string | null> | null {
    if (playlist.coverArt) {
      return playlist.coverArt;
    }
    
    if (playlist.trackIds.length > 0) {
      const firstTrackId = playlist.trackIds[0];
      const track = this.tracksSubject.value.find(t => t.id === firstTrackId);
      return track?.artwork || track?.imageUrl || 'assets/placeholder-playlist.png';
    }
    
    return 'assets/placeholder-playlist.png';
  }

  private tracksSubject = new BehaviorSubject<Track[]>([]);
  private playlistsSubject = new BehaviorSubject<Playlist[]>([]);
  private sqlite: SQLiteConnection;
  private db!: SQLiteDBConnection;
  private _initPromise: Promise<void> | null = null;
  
  tracks$ = this.tracksSubject.asObservable();
  playlists$ = this.playlistsSubject.asObservable();
  
  constructor(
    private platform: Platform
  ) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.loadTracks();
    this.loadPlaylists();
}

  async ensureInit(): Promise<void> {
    if (this._initPromise) return this._initPromise;        this._initPromise = (async () => {
      try {
        await this.platform.ready();
        
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
            is_local     INTEGER DEFAULT 0,
            source       TEXT CHECK(source IN ('local', 'stream')) DEFAULT 'stream',
            last_played  TEXT,
            added_at     TEXT
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
            image_url, preview_url,
            is_local, source, added_at, last_played
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            localTrack.id,
            localTrack.title,
            localTrack.artist,
            localTrack.album,
            localTrack.duration,
            localTrack.imageUrl,
            localTrack.previewUrl,
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

      this._initPromise = null;
      await this.ensureInit();
      
      console.log('Database reset completed');
      
      // Reload data
      await this.loadTracks();
      await this.loadPlaylists();
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
      
      const trackIndex = playlist.trackIds.indexOf(trackId);
      if (trackIndex !== -1) {
        playlist.trackIds.splice(trackIndex, 1);
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
      
      playlist.name = name;
      playlist.description = description;
      if (coverArt) {
        playlist.coverArt = coverArt;
      }
      
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
