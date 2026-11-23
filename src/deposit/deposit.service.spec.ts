import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { Deposit } from './schema/deposit.schema';
import { Org } from '../orgs/schema/org.schema';
import { ApiService } from '../api-service/api.service';
import { DepositStatus } from './enum/deposit-status.enum';

describe('DepositService', () => {
  let service: DepositService;
  let depositModel: any;
  let orgModel: { findOne: jest.Mock };
  let connection: { startSession: jest.Mock };
  let apiService: Record<string, jest.Mock>;

  beforeEach(async () => {
    connection = {
      startSession: jest.fn().mockImplementation(async () => ({
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      })),
    };
    orgModel = { findOne: jest.fn() };
    depositModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      }),
      findById: jest.fn().mockResolvedValue(null),
    };
    apiService = {
      getPK: jest.fn(),
      mintToken: jest.fn(),
      sendNotification: jest.fn(),
      buildExplorerLink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositService,
        { provide: getConnectionToken(), useValue: connection },
        { provide: getModelToken(Deposit.name), useValue: depositModel },
        { provide: getModelToken(Org.name), useValue: orgModel },
        { provide: ApiService, useValue: apiService },
      ],
    }).compile();

    service = module.get<DepositService>(DepositService);
  });

  describe('handleDeposit', () => {
    it('mints only once when two concurrent calls compete to claim a deposit', async () => {
      const deposit = {
        _id: 'pending-deposit',
        status: DepositStatus.Processing,
        amount: 100,
        txnHash: undefined,
        user: { wallet: 'user-wallet', nickname: 'alice' },
        save: jest.fn().mockResolvedValue(undefined),
      };
      // Model the atomic claim: one winner, one loser. The fallback read is
      // a separate snapshot taken while the winner is still processing.
      depositModel.findOneAndUpdate.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(deposit),
      });
      depositModel.findById.mockResolvedValue({
        _id: deposit._id,
        status: DepositStatus.Processing,
      });
      orgModel.findOne.mockResolvedValue({
        wallet: 'root-wallet',
        password: 'root-password',
      });
      apiService.getPK.mockResolvedValue('root-key');
      apiService.mintToken.mockResolvedValue('first-mint-hash');

      await expect(
        Promise.all([
          service.handleDeposit('pending-deposit', 100),
          service.handleDeposit('pending-deposit', 100),
        ]),
      ).resolves.toEqual([undefined, undefined]);

      expect(depositModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      for (const args of depositModel.findOneAndUpdate.mock.calls) {
        expect(args).toEqual([
          { _id: 'pending-deposit', status: DepositStatus.Pending },
          { $set: { status: DepositStatus.Processing } },
          { new: true },
        ]);
      }
      expect(apiService.mintToken).toHaveBeenCalledTimes(1);
      expect(apiService.sendNotification).toHaveBeenCalledTimes(1);
      expect(deposit.save).toHaveBeenCalledTimes(1);
      expect(deposit).toMatchObject({
        status: DepositStatus.Fulfilled,
        txnHash: 'first-mint-hash',
      });
      expect(connection.startSession).not.toHaveBeenCalled();
    });

    it('keeps a timed-out deposit Processing and does not mint again on redelivery', async () => {
      const deposit = {
        status: DepositStatus.Processing,
        amount: 100,
        user: { wallet: 'user-wallet', nickname: 'alice' },
        error: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };
      depositModel.findOneAndUpdate.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(deposit),
      });
      orgModel.findOne.mockResolvedValue({
        wallet: 'root-wallet',
        password: 'pwd',
      });
      const failure = new Error('Mint response timed out');
      apiService.mintToken.mockRejectedValue(failure);

      await expect(service.handleDeposit('pending-deposit', 100)).rejects.toBe(
        failure,
      );

      expect(deposit.status).toBe(DepositStatus.Processing);
      expect(deposit.error).toBe(failure.message);
      expect(deposit.save).toHaveBeenCalledTimes(1);

      // The next delivery cannot claim a deposit that is still Processing.
      const savedDeposit = { ...deposit };
      depositModel.findOneAndUpdate.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(null),
      });
      depositModel.findById.mockResolvedValueOnce(savedDeposit);

      await expect(
        service.handleDeposit('pending-deposit', 999),
      ).resolves.toBeUndefined();

      expect(depositModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(depositModel.findById).toHaveBeenCalledWith('pending-deposit');
      expect(apiService.mintToken).toHaveBeenCalledTimes(1);
      expect(deposit.save).toHaveBeenCalledTimes(1);
      expect(savedDeposit).toMatchObject({
        status: DepositStatus.Processing,
        amount: 100,
        error: failure.message,
      });
      expect(apiService.sendNotification).not.toHaveBeenCalled();
    });

    it.each([DepositStatus.Fulfilled, DepositStatus.Processing])(
      'ignores a %s deposit without changing data or repeating side effects',
      async (status) => {
        const deposit = {
          _id: 'fulfilled-deposit',
          status,
          amount: 100,
          txnHash: 'original-txn-hash',
          user: { wallet: 'user-wallet', nickname: 'alice' },
          save: jest.fn().mockResolvedValue(undefined),
        };
        depositModel.findById.mockResolvedValue(deposit);

        // A different incoming amount makes accidental overwrites observable.
        await expect(
          service.handleDeposit('fulfilled-deposit', 999),
        ).resolves.toBeUndefined();

        expect(deposit).toMatchObject({
          status,
          amount: 100,
          txnHash: 'original-txn-hash',
        });
        expect(deposit.save).not.toHaveBeenCalled();
        expect(apiService.getPK).not.toHaveBeenCalled();
        expect(apiService.mintToken).not.toHaveBeenCalled();
        expect(apiService.sendNotification).not.toHaveBeenCalled();
      },
    );

    it('throws when the deposit record does not exist', async () => {
      await expect(
        service.handleDeposit('missing-id', 100),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(apiService.mintToken).not.toHaveBeenCalled();
    });
  });
});
