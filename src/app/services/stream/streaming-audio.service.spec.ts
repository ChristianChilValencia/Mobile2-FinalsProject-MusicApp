import { TestBed } from '@angular/core/testing';

import { StreamingAudioService } from './streaming-audio.service';

describe('StreamingAudioService', () => {
  let service: StreamingAudioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StreamingAudioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
