import { describe, it, expect } from 'vitest';
import { CHORE_PICTURES, pictureFor, suggestPicture } from './choreIcons';

describe('chore pictures', () => {
  it('bundles all 40 icons with readable labels', () => {
    expect(CHORE_PICTURES).toHaveLength(40);
    expect(pictureFor('pic:make_bed')?.label).toBe('Make bed');
    expect(pictureFor('🧹')).toBeUndefined();
    expect(pictureFor('pic:nope')).toBeUndefined();
  });

  it('suggests the most specific picture for a chore name', () => {
    const s = (name: string) => suggestPicture(name)?.id;
    expect(s('Make bed')).toBe('make_bed');
    expect(s('Unload dishwasher')).toBe('unload_dishwasher');
    expect(s('Load the dishwasher')).toBe('load_dishwasher');
    expect(s('Take out trash')).toBe('take_out_trash');
    expect(s('Vacuum living room')).toBe('vacuum_floors');
    expect(s('Feed the dog')).toBe('feed_pets');
    expect(s('Change bed sheets')).toBe('make_bed');
    expect(s('Practice piano')).toBeUndefined();
  });
});
