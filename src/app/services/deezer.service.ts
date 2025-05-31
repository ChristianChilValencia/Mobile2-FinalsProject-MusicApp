import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Track } from '../models/track.model';
import { environment } from '../../environments/environment';

// Add DeezerTrack interface
export interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  duration_formatted?: string;
  preview: string;
  artist: {
    id: number;
    name: string;
  };
  album: {
    id: number;
    title: string;
    cover_small: string;
    cover_medium: string;
    cover_big: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DeezerService {
  private readonly API_URL = 'https://deezerdevs-deezer.p.rapidapi.com/search';
  private readonly API_BASE_URL = 'https://deezerdevs-deezer.p.rapidapi.com';
  private readonly headers = new HttpHeaders({
    'X-RapidAPI-Key': '22b38b0583msh6ca6120bebde3a8p1a434cjsnfea3a2d94f6d',
    'X-RapidAPI-Host': 'deezerdevs-deezer.p.rapidapi.com'
  });

  constructor(private http: HttpClient) { }

  search(query: string): Observable<Track[]> {
    return this.http.get<any>(this.API_URL, {
      headers: this.headers,
      params: { q: query }
    }).pipe(
      map(response => {
        if (response && response.data) {
          return response.data.map((item: any) => this.mapDeezerTrackToTrack(item));
        }
        return [];
      })
    );
  }  
  
  getTrendingTracks(): Observable<DeezerTrack[]> {
    // Using search for popular terms as a reliable way to get trending-like tracks
    return this.searchPopularTerms();
  }
  
  private searchPopularTerms(): Observable<DeezerTrack[]> {
    // Use some popular search terms as a fallback
    const popularTerms = ['top hits', 'popular', 'chart', 'trending'];
    const randomTerm = popularTerms[Math.floor(Math.random() * popularTerms.length)];
    
    return this.http.get<any>(this.API_URL, {
      headers: this.headers,
      params: { q: randomTerm }
    }).pipe(
      map(response => {
        if (response && response.data && Array.isArray(response.data)) {
          return response.data.map((track: any) => this.enhanceTrackData(track));
        }
        return [];
      }),
      catchError(this.handleError<DeezerTrack[]>('searchPopularTerms', []))
    );
  }

  private enhanceTrackData(track: any): DeezerTrack {
    // Add calculated properties or defaults
    return {
      ...track,
      duration_formatted: this.formatDuration(track.duration || 0),
      album: {
        ...track.album,
        cover_small: track.album?.cover_small || this.getDefaultCoverUrl('small'),
        cover_medium: track.album?.cover_medium || this.getDefaultCoverUrl('medium'),
        cover_big: track.album?.cover_big || this.getDefaultCoverUrl('big')
      }
    };
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }

  private getDefaultCoverUrl(size: 'small' | 'medium' | 'big'): string {
    const placeholder = 'assets/placeholder-album.png';
    return placeholder;
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);
      return new Observable<T>(observer => observer.next(result as T));
    };
  }

  private mapDeezerTrackToTrack(deezerTrack: any): Track {
    return {
      id: `deezer-${deezerTrack.id}`,
      title: deezerTrack.title || 'Unknown Title',
      artist: deezerTrack.artist?.name || 'Unknown Artist',
      album: deezerTrack.album?.title || 'Unknown Album',
      duration: deezerTrack.duration || 0,
      imageUrl: deezerTrack.album?.cover_medium || 'assets/placeholder-album.png',
      previewUrl: deezerTrack.preview || '',
      spotifyId: '',
      liked: false,
      isLocal: false,
      source: 'stream',
      addedAt: new Date().toISOString(),
      pathOrUrl: deezerTrack.preview || '',
      artwork: deezerTrack.album?.cover_medium || null,
      type: 'mp3'
    };
  }
}
