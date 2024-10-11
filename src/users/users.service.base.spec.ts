import { NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { UsersServiceBase } from './users.service.base';

class TestUsersService extends UsersServiceBase {}

describe('UsersServiceBase', () => {
  let service: TestUsersService;
  let userRepository: { findById: jest.Mock };
  let userNonceModel: any;
  let apiService: { createNonceAccount: jest.Mock };

  beforeEach(() => {
    userRepository = { findById: jest.fn() };
    userNonceModel = { findOne: jest.fn() };
    apiService = {
      createNonceAccount: jest.fn().mockResolvedValue({
        secretKey: new Uint8Array([1, 2, 3, 4]),
      }),
    };

    service = new TestUsersService(
      userRepository as any,
      userNonceModel as any,
      apiService as any,
    );
  });

  describe('getByUserId', () => {
    const userId = new mongoose.Types.ObjectId().toString();

    it('returns the user when found', async () => {
      const user = { _id: userId, nickname: 'alice' };
      userRepository.findById.mockResolvedValue(user);

      await expect(service.getByUserId(userId)).resolves.toBe(user);
      expect(userRepository.findById).toHaveBeenCalledWith(
        new mongoose.Types.ObjectId(userId),
        undefined,
        { session: undefined },
      );
    });

    it('throws when the user is missing', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.getByUserId(userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getNonce', () => {
    it('returns an existing nonce for the wallet', async () => {
      const existingNonce = { wallet: 'wallet-1', nonce: 'abc' };
      userNonceModel.findOne.mockResolvedValue(existingNonce);

      await expect(service.getNonce('wallet-1')).resolves.toBe(existingNonce);
      expect(apiService.createNonceAccount).not.toHaveBeenCalled();
    });

    it('creates and stores a nonce when none exists', async () => {
      const save = jest.fn().mockResolvedValue({ wallet: 'wallet-2' });
      userNonceModel = Object.assign(
        jest.fn().mockImplementation(() => ({ save })),
        { findOne: jest.fn().mockResolvedValue(null) },
      );
      service = new TestUsersService(
        userRepository as any,
        userNonceModel,
        apiService as any,
      );

      await service.getNonce('wallet-2');

      expect(apiService.createNonceAccount).toHaveBeenCalled();
      expect(save).toHaveBeenCalled();
    });
  });
});
