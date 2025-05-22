export interface Track {
  id: string;
  title: string;
  artist: string;
  source: 'local' | 'stream';
  pathOrUrl: string;
  duration: number;
  album?: string;
  artwork?: string;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
  coverArt?: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  duration: number;
  currentTime: number;
  volume: number;
}

export type RepeatMode = 'off' | 'all' | 'one';
