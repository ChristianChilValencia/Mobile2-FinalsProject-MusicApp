import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlaylistStreamPage } from './playlist-stream.page';

describe('PlaylistStreamPage', () => {
  let component: PlaylistStreamPage;
  let fixture: ComponentFixture<PlaylistStreamPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PlaylistStreamPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
