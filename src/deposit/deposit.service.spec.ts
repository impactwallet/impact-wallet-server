import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { Deposit } from './schema/deposit.schema';
import { Org } from '../orgs/schema/org.schema';
import { ApiService } from '../api-service/api.service';

describe('DepositService', () => {
  let service: DepositService;
  let depositModel: any;
  let connection: { startSession: jest.Mock };
  let apiService: Record<string, jest.Mock>;

  beforeEach(async () => {
    const endSession = jest.fn();
    const withTransaction = jest.fn(async (callback) => callback());
    connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction,
        endSession,
      }),
    };
    depositModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      }),
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
        { provide: getModelToken(Org.name), useValue: {} },
        { provide: ApiService, useValue: apiService },
      ],
    }).compile();

    service = module.get<DepositService>(DepositService);
  });

  describe('handleDeposit', () => {
    it('throws when the deposit record does not exist', async () => {
      await expect(service.handleDeposit('missing-id', 100)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(connection.startSession).toHaveBeenCalled();
    });
  });
});
