import { defaultTo, get, isNil, isNumber, isString, toNumber } from 'lodash';
import bigjs from 'big.js';

export const toBigJs = (number: any, options?: any) => {
  const isBigJsNumber = number instanceof bigjs;
  if ((isNaN(number) || isNaN(Number(number))) && !isBigJsNumber) {
    return bigjs(0);
  }
  if (!isNil(options) && isNumber(options.precision)) {
    const formattedNumber = Number(number.toFixed(options.precision));
    if (isNaN(formattedNumber)) {
      return bigjs(0);
    }
    if (!isNumber(formattedNumber) && !isBigJsNumber) {
      return bigjs(0);
    }
    return bigjs(formattedNumber);
  }
  return bigjs(number);
};

export const decimal128ToNumber = (field: any) => {
  if (get(field, '_bsontype') === 'Decimal128' && !isNil(field)) {
    field = parseFloat(field.toString());
  }
  return field;
};

export const bigJsToNumber = (number: any) => {
  if (isString(number)) {
    number = Number(number);
  }
  if (number instanceof bigjs) {
    return number.toNumber();
  }
  if (isNil(number)) {
    return 0;
  }
  return ensureNumber(number);
};

const ensureNumber = (value: any) => {
  if (value instanceof bigjs) {
    return value.toNumber();
  }
  return defaultTo(toNumber(value), 0);
};

export const toFixed = (value: bigjs, precision: number) => {
  return new bigjs(value.toFixed(precision));
};
