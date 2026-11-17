import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { ApiService } from './api.service';

describe('ApiService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('confirmTxnWithRetry', () => {
    it.each([0, 2, 5])(
      'performs at most %i retries after the initial transaction fails',
      async (maxRetries) => {
        // Exercise the real method without constructing RPC or HTTP clients.
        const service = Object.create(ApiService.prototype) as ApiService;
        const transactionError = 'Transaction failed';
        const failedTransaction = {
          meta: { err: transactionError },
        } as ParsedTransactionWithMeta;
        const retryFn = jest.fn().mockResolvedValue('retry-txn-hash');
        let confirmationCount = 0;

        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest
          .spyOn(service, 'getParsedTransaction')
          .mockImplementation(async () => {
            confirmationCount += 1;
            // Bound the test even if the implementation recurses indefinitely.
            // One initial confirmation plus one per allowed retry is sufficient.
            if (confirmationCount > maxRetries + 1) {
              throw new Error('Retry limit exceeded');
            }
            return failedTransaction;
          });

        const outcome = await service
          .confirmTxnWithRetry('initial-txn-hash', retryFn, 0, maxRetries)
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );

        expect(retryFn).toHaveBeenCalledTimes(maxRetries);
        expect(outcome).toEqual({ error: transactionError });
      },
    );
  });
});
