import bigjs from 'big.js';
import {
  bigJsToNumber,
  decimal128ToNumber,
  toBigJs,
  toFixed,
} from './bigjs';

describe('toBigJs', () => {
  it('converts valid numbers', () => {
    expect(toBigJs(10).toNumber()).toBe(10);
    expect(toBigJs('3.14').toNumber()).toBe(3.14);
  });

  it('returns zero for invalid values', () => {
    expect(toBigJs(NaN).toNumber()).toBe(0);
    expect(toBigJs('not-a-number').toNumber()).toBe(0);
  });

  it('applies precision when provided', () => {
    expect(toBigJs(1.239, { precision: 2 }).toNumber()).toBe(1.24);
  });

  it('returns the same value when input is already a Big instance', () => {
    const value = bigjs(42);

    expect(toBigJs(value).eq(value)).toBe(true);
  });
});

describe('decimal128ToNumber', () => {
  it('converts Decimal128 values to numbers', () => {
    const decimal128 = {
      _bsontype: 'Decimal128',
      toString: () => '12.34',
    };

    expect(decimal128ToNumber(decimal128)).toBe(12.34);
  });

  it('returns the original value for non-Decimal128 input', () => {
    expect(decimal128ToNumber(7)).toBe(7);
    expect(decimal128ToNumber('7')).toBe('7');
  });
});

describe('bigJsToNumber', () => {
  it('converts Big instances and numeric strings', () => {
    expect(bigJsToNumber(bigjs('9.5'))).toBe(9.5);
    expect(bigJsToNumber('4')).toBe(4);
  });

  it('returns zero for nil values', () => {
    expect(bigJsToNumber(null)).toBe(0);
    expect(bigJsToNumber(undefined)).toBe(0);
  });
});

describe('toFixed', () => {
  it('rounds values to the requested precision', () => {
    expect(toFixed(bigjs('1.239'), 2).toString()).toBe('1.24');
  });
});
