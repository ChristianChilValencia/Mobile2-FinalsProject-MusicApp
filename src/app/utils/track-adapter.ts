import { Track as MainTrack } from '../services/data.service';
import { Track as LocalTrack } from '../local-services/media-player.service';

/**
 * Adapts a local track to the main app track format
 */
export function adaptLocalTrackToMainTrack(localTrack: LocalTrack): MainTrack {
  return {
    id: localTrack.id,
    title: localTrack.title,
    artist: localTrack.artist,
    album: localTrack.album,
    duration: localTrack.duration,
    imageUrl: localTrack.imageUrl,
    previewUrl: localTrack.previewUrl,
    spotifyId: localTrack.spotifyId || '',
    liked: localTrack.liked,
    isLocal: true,
    localPath: localTrack.localPath,
    source: 'local',
    addedAt: new Date().toISOString(),
    artwork: localTrack.imageUrl,
    type: localTrack.previewUrl?.split('.').pop() || 'mp3',
    pathOrUrl: localTrack.previewUrl
  };
}
