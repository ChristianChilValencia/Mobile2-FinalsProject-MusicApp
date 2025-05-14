import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StreamPage } from './stream.page';

describe('StreamPage', () => {
  let component: StreamPage;
  let fixture: ComponentFixture<StreamPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StreamPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
