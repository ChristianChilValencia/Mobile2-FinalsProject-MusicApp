import { TestBed } from '@angular/core/testing';

import { LocalAudioService } from './local-audio.service';

describe('LocalAudioService', () => {
  let service: LocalAudioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LocalAudioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
