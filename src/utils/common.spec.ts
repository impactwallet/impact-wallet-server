import { isDefined } from './common';

describe('isDefined', () => {
  it.each([
    [0, true],
    [false, true],
    ['', true],
    [[], true],
    [{}, true],
  ])('returns true for defined value %p', (value, expected) => {
    expect(isDefined(value)).toBe(expected);
  });

  it.each([
    [undefined, false],
    [null, false],
  ])('returns false for %p', (value, expected) => {
    expect(isDefined(value)).toBe(expected);
  });
});
