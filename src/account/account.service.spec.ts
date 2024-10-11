jest.mock('../app.module', () => ({
  connection: {
    model: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Keypair } from '@solana/web3.js';
import { AccountService } from './account.service';
import { ApiService } from '../api-service/api.service';
import { StripeService } from '../api-service/stripe.service';
import { Deposit } from '../deposit/schema/deposit.schema';
import { User } from '../users/schema/user.schema';
import { Org } from '../orgs/schema/org.schema';
import { Payment } from '../payment/schema/payment.schema';
import { SaleOffer } from '../offers/schema/sale-offer.schema';

describe('AccountService', () => {
  let service: AccountService;
  const wallet = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const rootWallet = Keypair.generate().publicKey;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: ApiService, useValue: {} },
        { provide: StripeService, useValue: {} },
        { provide: getConnectionToken(), useValue: {} },
        { provide: getModelToken(Deposit.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Org.name), useValue: {} },
        { provide: getModelToken(Payment.name), useValue: {} },
        { provide: getModelToken(SaleOffer.name), useValue: {} },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  describe('_getTxnAmount', () => {
    const buildTxn = (instructions: any[]) =>
      ({
        transaction: { message: { instructions } },
        meta: { err: null },
      }) as any;

    it('detects sent transfers as negative amounts', () => {
      const txn = buildTxn([
        {
          parsed: {
            type: 'transfer',
            info: {
              source: wallet.toString(),
              destination: recipient.toString(),
              amount: '1000',
            },
          },
        },
      ]);

      const result = service._getTxnAmount(txn, wallet, rootWallet);

      expect(result).toEqual([
        { amount: -1000, description: 'Sent', authority: '' },
      ]);
    });

    it('detects received transfers as positive amounts', () => {
      const txn = buildTxn([
        {
          parsed: {
            type: 'transfer',
            info: {
              source: recipient.toString(),
              destination: wallet.toString(),
              amount: '500',
            },
          },
        },
      ]);

      const result = service._getTxnAmount(txn, wallet, rootWallet);

      expect(result).toEqual([
        { amount: 500, description: 'Received', authority: '' },
      ]);
    });

    it('labels commission transfers to the root wallet', () => {
      const txn = buildTxn([
        {
          parsed: {
            type: 'transfer',
            info: {
              source: wallet.toString(),
              destination: rootWallet.toString(),
              amount: '50',
            },
          },
        },
      ]);

      const result = service._getTxnAmount(txn, wallet, rootWallet);

      expect(result[0]).toMatchObject({
        amount: -50,
        description: 'Commission',
      });
    });

    it('labels mint-to instructions as deposits', () => {
      const txn = buildTxn([
        {
          parsed: {
            type: 'mintTo',
            info: {
              account: wallet.toString(),
              tokenAmount: { amount: '2500' },
            },
          },
        },
      ]);

      const result = service._getTxnAmount(txn, wallet, rootWallet);

      expect(result).toEqual([
        { amount: 2500, description: 'Deposited', authority: '' },
      ]);
    });

    it('labels burn instructions and distinguishes withdrawals', () => {
      const txn = buildTxn([
        {
          parsed: {
            type: 'burn',
            info: {
              account: wallet.toString(),
              amount: '300',
            },
          },
        },
        {
          parsed: {
            type: 'transfer',
            info: {
              source: wallet.toString(),
              destination: recipient.toString(),
              amount: '300',
            },
          },
        },
      ]);

      const result = service._getTxnAmount(txn, wallet, rootWallet);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ amount: -300, description: 'Withdrawn' }),
        ]),
      );
    });

    it('ignores instructions unrelated to the wallet', () => {
      const txn = buildTxn([
        {
          parsed: {
            type: 'transfer',
            info: {
              source: recipient.toString(),
              destination: rootWallet.toString(),
              amount: '100',
            },
          },
        },
      ]);

      expect(service._getTxnAmount(txn, wallet, rootWallet)).toEqual([]);
    });
  });
});
