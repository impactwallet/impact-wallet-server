import mongoose from 'mongoose';
import { areObjectIdsEqual } from './mongo';

describe('areObjectIdsEqual', () => {
  const id = new mongoose.Types.ObjectId();

  it('returns true when comparing the same id in different formats', () => {
    expect(areObjectIdsEqual(id, id.toString())).toBe(true);
    expect(areObjectIdsEqual(id.toString(), id)).toBe(true);
  });

  it('returns false for different ids', () => {
    const otherId = new mongoose.Types.ObjectId();

    expect(areObjectIdsEqual(id, otherId)).toBe(false);
    expect(areObjectIdsEqual(id.toString(), otherId.toString())).toBe(false);
  });
});
