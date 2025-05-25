import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Track } from './data.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DeezerService {
  private readonly API_URL = 'https://deezerdevs-deezer.p.rapidapi.com/search';
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

  private mapDeezerTrackToTrack(deezerTrack: any): Track {
    return {
      id: `deezer-${deezerTrack.id}`,
      title: deezerTrack.title || 'Unknown Title',
      artist: deezerTrack.artist?.name || 'Unknown Artist',
      album: deezerTrack.album?.title || 'Unknown Album',
      artwork: deezerTrack.album?.cover_medium || null,
      duration: deezerTrack.duration || 0,
      pathOrUrl: deezerTrack.preview || '',
      source: 'stream',
      addedAt: new Date().toISOString()
    };
  }
}
