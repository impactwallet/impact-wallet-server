jest.mock('../app.module', () => ({
  connection: {
    model: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import mongoose from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { OrgsService } from './orgs.service';
import { Org } from './schema/org.schema';
import { Member } from '../members/schema/member.schema';
import { Payment } from '../payment/schema/payment.schema';
import { MembersService } from '../members/members.service';
import { AuthService } from '../auth/auth.service';
import { ApiService } from '../api-service/api.service';
import { S3Service } from '../s3/s3.service';
import { PaymentService } from '../payment/payment.service';
import { StripeService } from '../api-service/stripe.service';
import { AccountModel } from '../auth/models/account.model';

describe('OrgsService', () => {
  let service: OrgsService;
  let orgRepository: Record<string, jest.Mock>;
  let membersRepository: { findOne: jest.Mock };
  let memberService: { getMembers: jest.Mock; getMemberById: jest.Mock };
  let apiService: {
    getNativeTokenBalance: jest.Mock;
    getPK: jest.Mock;
    transferNativeToken: jest.Mock;
    sendNotification: jest.Mock;
    buildExplorerLink: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let paymentService: { handleRegularPayment: jest.Mock };

  beforeEach(async () => {
    orgRepository = {
      findById: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    membersRepository = { findOne: jest.fn() };
    memberService = {
      getMembers: jest.fn().mockResolvedValue({ list: [], total: 0 }),
      getMemberById: jest.fn(),
    };
    apiService = {
      getNativeTokenBalance: jest.fn(),
      getPK: jest.fn(),
      transferNativeToken: jest.fn().mockResolvedValue('txn-sig'),
      sendNotification: jest.fn(),
      buildExplorerLink: jest.fn().mockReturnValue('https://explorer/tx'),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    paymentService = { handleRegularPayment: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgsService,
        { provide: getModelToken(Org.name), useValue: orgRepository },
        { provide: getModelToken(Member.name), useValue: membersRepository },
        { provide: getModelToken(Payment.name), useValue: {} },
        { provide: getConnectionToken(), useValue: {} },
        { provide: MembersService, useValue: memberService },
        { provide: AuthService, useValue: {} },
        { provide: ApiService, useValue: apiService },
        { provide: S3Service, useValue: {} },
        { provide: JwtService, useValue: jwtService },
        { provide: PaymentService, useValue: paymentService },
        { provide: StripeService, useValue: {} },
      ],
    }).compile();

    service = module.get<OrgsService>(OrgsService);
  });

  describe('getByOrgId', () => {
    const orgId = new mongoose.Types.ObjectId().toString();

    it('returns the organization when it exists', async () => {
      const org = { _id: orgId, name: 'Acme' };
      orgRepository.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(org),
      });

      await expect(service.getByOrgId(orgId)).resolves.toBe(org);
    });

    it('throws when the organization is missing', async () => {
      orgRepository.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getByOrgId(orgId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findOrgByUsername', () => {
    it('throws when no organization matches the username', async () => {
      orgRepository.find.mockResolvedValue([]);

      await expect(
        service.findOrgByUsername({ searchTerm: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('queries with a case-insensitive exact match regex', async () => {
      orgRepository.find.mockResolvedValue([{ username: 'acme' }]);

      await service.findOrgByUsername({ searchTerm: 'Acme' });

      expect(orgRepository.find).toHaveBeenCalledWith({
        username: { $regex: /^Acme$/i },
      });
    });
  });

  describe('loginAsOrg', () => {
    it('returns a jwt when the user is a member of the org', async () => {
      const orgId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const org = { _id: orgId, username: 'acme' };
      const account = new AccountModel({ _id: userId } as any);

      orgRepository.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(org),
      });
      membersRepository.findOne.mockResolvedValue({ role: 'Admin' });

      const result = await service.loginAsOrg(orgId.toString(), account);

      expect(result).toEqual({ token: 'signed-jwt' });
      expect(jwtService.sign).toHaveBeenCalledWith({
        userId,
        orgId,
      });
    });

    it('throws when the user is not a member', async () => {
      const orgId = new mongoose.Types.ObjectId();
      const account = new AccountModel({
        _id: new mongoose.Types.ObjectId(),
      } as any);

      orgRepository.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: orgId }),
      });
      membersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.loginAsOrg(orgId.toString(), account),
      ).rejects.toThrow('Member not found');
    });
  });

  describe('uploadLogo', () => {
    it('throws when logo file is missing', async () => {
      await expect(service.uploadLogo(null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('sendUsdc', () => {
    it('throws when the org balance is insufficient', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();
      const org = {
        _id: orgId,
        wallet: 'org-wallet',
        password: 'secret',
        username: 'acme',
      };

      orgRepository.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(org),
      });
      apiService.getNativeTokenBalance.mockResolvedValue({ uiAmount: 5 });

      await expect(
        service.sendUsdc(orgId, { amount: 10, recipient: 'recipient' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('transfers tokens when balance is sufficient', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();
      const org = {
        _id: orgId,
        wallet: 'org-wallet',
        password: 'secret',
        username: 'acme',
      };

      orgRepository.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(org),
      });
      apiService.getNativeTokenBalance.mockResolvedValue({ uiAmount: 100 });
      apiService.getPK.mockResolvedValue('private-key');

      await service.sendUsdc(orgId, {
        amount: 10,
        recipient: 'recipient-wallet',
      } as any);

      expect(apiService.transferNativeToken).toHaveBeenCalled();
      expect(apiService.sendNotification).toHaveBeenCalled();
    });
  });

  describe('getOrgMembers', () => {
    it('delegates to members service with org and equity filter', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      await service.getOrgMembers(orgId, { limit: 5 } as any);

      expect(memberService.getMembers).toHaveBeenCalledWith(
        expect.objectContaining({
          org: expect.any(mongoose.Types.ObjectId),
          equity: { gt: 0 },
          limit: 5,
        }),
        'user orgUser',
      );
    });
  });

  describe('getContent / getApps', () => {
    it('queries content organizations', () => {
      const select = jest.fn().mockReturnValue('content-query');
      orgRepository.find.mockReturnValue({ select });

      expect(service.getContent()).toBe('content-query');
      expect(orgRepository.find).toHaveBeenCalledWith({
        'settings.isContent': true,
      });
    });

    it('queries app organizations', () => {
      const select = jest.fn().mockReturnValue('apps-query');
      orgRepository.find.mockReturnValue({ select });

      expect(service.getApps()).toBe('apps-query');
      expect(orgRepository.find).toHaveBeenCalledWith({
        'settings.isApp': true,
      });
    });
  });
});
