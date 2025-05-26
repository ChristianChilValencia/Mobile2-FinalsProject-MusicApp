import { TestBed } from '@angular/core/testing';

import { MediaScannerService } from './media-scanner.service';

describe('MediaScannerService', () => {
  let service: MediaScannerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MediaScannerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
