import { HttpStatus } from '@nestjs/common';
import { AccessDeniedException } from './access-denied.exception';

describe('AccessDeniedException', () => {
  it('sets status to FORBIDDEN and preserves the message payload', () => {
    const payload = { message: 'Access denied' };
    const exception = new AccessDeniedException(payload);

    expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(exception.message).toEqual(payload);
    expect(exception.getResponse()).toEqual(payload);
  });

  it('accepts a plain string response', () => {
    const exception = new AccessDeniedException('Forbidden');

    expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(exception.getResponse()).toBe('Forbidden');
  });
});
