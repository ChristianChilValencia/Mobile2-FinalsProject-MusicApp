import { Injectable } from '@angular/core';
import { Platform, ToastController, ActionSheetController, AlertController } from '@ionic/angular';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

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
    private platform: Platform,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController
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
        
        if (this.platform.is('hybrid')) {
          await this.sqlite.checkConnectionsConsistency();
          this.db = await this.sqlite.createConnection('vibeflow.db', false, 'no-encryption', 1, false);
        } else {
          await this.sqlite.initWebStore();
          this.db = await this.sqlite.createConnection('vibeflow.db', false, 'no-encryption', 1, false);
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

  async saveLocalMusic(track: Track, filePath: string): Promise<void> {
    try {
      const tracks = this.tracksSubject.value;      
      const localTrack: Track = {
        ...track,
        isLocal: true,
        source: 'local',
        localPath: filePath
      };

      const existingIndex = tracks.findIndex(t => t.id === track.id);
      if (existingIndex >= 0) {
        tracks[existingIndex] = localTrack;
      } else {
        tracks.push(localTrack);
      }
      
      this.tracksSubject.next(tracks);
      await this.saveTracks(tracks);
      
      if (this.platform.is('hybrid')) {
        await this.ensureInit();
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
      const tracks = this.tracksSubject.value.filter(t => t.id !== trackId);
      this.tracksSubject.next(tracks);
      await this.saveTracks(tracks);
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
  
  async showToast(message: string, color: string = 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });  
    await toast.present();
  }

  async showAddToPlaylistOptions(track: Track): Promise<void> {
    const playlists = await this.getAllPlaylists();
    const buttons: any[] = [];

    buttons.push({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        this.createArtistMixWithTrack(track);
        return true;
      }
    });
    
    buttons.push({
      text: 'Create Playlist',
      handler: () => {
        this.createCustomPlaylistWithTrack(track);
        return true;
      }
    });

    if (playlists.length > 0) {
      playlists.forEach(playlist => {
        buttons.push({
          text: playlist.name,
          handler: () => {
            this.addTrackToPlaylistAndNotify(track, playlist.id);
            return true;
          }
        });
      });
    }
    
    buttons.push({
      text: 'Cancel',
      role: 'cancel'
    });
    const actionSheet = await this.actionSheetController.create({
      header: 'Add to Playlist',
      buttons
    });
    await actionSheet.present();
  }

  async createArtistMixWithTrack(track: Track): Promise<void> {
    const newPlaylistName = `${track.artist}'s Mix`;    
    try {
      const playlist = await this.createPlaylist(newPlaylistName);
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.saveLocalMusic(track, filePath);
      await this.addTrackToPlaylist(playlist.id, track.id);
      await this.showToast(`Created artist mix: ${newPlaylistName}`);
    } catch (error) {
      console.error('Error creating artist mix:', error);
      await this.showToast('Failed to create artist mix', 'danger');
    }
  }
  
  async addTrackToPlaylistAndNotify(track: Track, playlistId: string): Promise<void> {
    try {
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.saveLocalMusic(track, filePath);
      await this.addTrackToPlaylist(playlistId, track.id);
      
      const playlist = await this.getPlaylist(playlistId);
      await this.showToast(`Added to ${playlist?.name || 'playlist'}`);
    } catch (error) {
      console.error('Error adding to playlist:', error);
      await this.showToast('Failed to add to playlist', 'danger');
    }
  }

  async createCustomPlaylistWithTrack(track: Track): Promise<void> {
    const alert = await this.alertController.create({
      header: 'New Playlist',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Playlist Name'
        },
        {
          name: 'description',
          type: 'text',
          placeholder: 'Description (optional)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Create',
          handler: async (data) => {
            if (!data.name || data.name.trim() === '') {
              await this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            try {
              const playlist = await this.createPlaylist(data.name, data.description);
              const filePath = track.pathOrUrl || track.previewUrl;
              await this.saveLocalMusic(track, filePath);
              await this.addTrackToPlaylist(playlist.id, track.id);              
              await this.showToast(`Created playlist: ${data.name}`);
              return true;
            } catch (error) {
              console.error('Error creating playlist:', error);
              await this.showToast('Failed to create playlist', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }
}
