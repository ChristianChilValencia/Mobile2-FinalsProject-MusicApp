export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  previewUrl: string;
  spotifyId: string;
  liked: boolean;
  isLocal: boolean;
  localPath?: string;
  source?: 'local' | 'stream';
  addedAt?: string;
  lastPlayed?: string;
  type?: string;
  artwork?: string | null;
  pathOrUrl?: string;
}
