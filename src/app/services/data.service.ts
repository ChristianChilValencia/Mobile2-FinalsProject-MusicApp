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
    throw new Error('Method not implemented.');
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

  async addLiked(trackId: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;
      const track = tracks.find(t => t.id === trackId);
      if (!track) return;

      track.liked = true;
      this.tracksSubject.next(tracks);
      await this.saveTracks(tracks);

      if (this.platform.is('hybrid')) {
        await this.ensureInit();
        const now = new Date().toISOString();
        await this.db.run(
          `INSERT OR IGNORE INTO liked_music (track_id, liked_at) VALUES (?, ?);`,
          [trackId, now]
        );
        await this.db.run(
          `UPDATE tracks SET liked = 1 WHERE id = ?;`,
          [trackId]
        );
      }
    } catch (error) {
      console.error('Error adding liked track:', error);
      throw error;
    }
  }

  async removeLiked(trackId: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;
      const track = tracks.find(t => t.id === trackId);
      if (!track) return;

      track.liked = false;
      this.tracksSubject.next(tracks);
      await this.saveTracks(tracks);

      if (this.platform.is('hybrid')) {
        await this.ensureInit();
        await this.db.run(
          `DELETE FROM liked_music WHERE track_id = ?;`,
          [trackId]
        );
        await this.db.run(
          `UPDATE tracks SET liked = 0 WHERE id = ?;`,
          [trackId]
        );
      }
    } catch (error) {
      console.error('Error removing liked track:', error);
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
        // Delete the actual file for local tracks
        try {
          if (track.previewUrl?.startsWith('blob:')) {
            console.log('Blob URL will be garbage collected:', track.previewUrl);
          }
          else if (track.previewUrl?.startsWith('file://')) {
            const path = track.previewUrl.replace(/^file:\/\//, '');
            await Filesystem.deleteFile({
              path,
              directory: Directory.Data
            });
          }
        } catch (fileError) {
          console.warn('Error deleting file:', fileError);
        }
      }
      
      // Update tracks array
      const updatedTracks = tracks.filter(t => t.id !== id);
      this.tracksSubject.next(updatedTracks);
      await this.saveTracks(updatedTracks);
      
      // Remove from SQLite tables on mobile
      if (this.platform.is('hybrid')) {
        await this.ensureInit();
        await this.db.run('DELETE FROM tracks WHERE id = ?', [id]);
        await this.db.run('DELETE FROM liked_music WHERE track_id = ?', [id]);
        await this.db.run('DELETE FROM downloaded_music WHERE track_id = ?', [id]);
        await this.db.run('DELETE FROM playlist_tracks WHERE track_id = ?', [id]);
      }
      
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

  async set(key: string, value: any): Promise<void> {
    await Preferences.set({
      key,
      value: JSON.stringify(value)
    });
  }

  async get(key: string): Promise<any> {
    const result = await Preferences.get({ key });
    return result.value ? JSON.parse(result.value) : null;
  }
}


