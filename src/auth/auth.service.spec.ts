jest.mock('../app.module', () => ({
  connection: {
    model: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import mongoose from 'mongoose';
import { AuthService } from './auth.service';
import { User } from '../users/schema/user.schema';
import { Org } from '../orgs/schema/org.schema';
import { Member } from '../members/schema/member.schema';
import { AccessDeniedException } from '../exceptions/access-denied.exception';
import { Role } from '../members/enum/roles.enum';
import { AccountModel } from './models/account.model';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { verify: jest.Mock };
  let userModel: { findById: jest.Mock };
  let orgModel: { findById: jest.Mock };
  let memberRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    jwtService = { verify: jest.fn() };
    userModel = { findById: jest.fn() };
    orgModel = { findById: jest.fn() };
    memberRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Org.name), useValue: orgModel },
        { provide: getModelToken(Member.name), useValue: memberRepository },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('getAccountFromToken', () => {
    it('throws when the authorization header is missing', async () => {
      await expect(
        service.getAccountFromToken({ headers: {} } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when the bearer token format is invalid', async () => {
      await expect(
        service.getAccountFromToken({
          headers: { authorization: 'Token abc' },
        } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns an account when the token and user are valid', async () => {
      const user = { _id: new mongoose.Types.ObjectId() };

      jwtService.verify.mockReturnValue({ userId: user._id.toString() });
      userModel.findById.mockResolvedValue(user);

      const account = await service.getAccountFromToken({
        headers: { authorization: 'Bearer valid-token' },
      } as any);

      expect(account).toBeInstanceOf(AccountModel);
      expect(account.user).toBe(user);
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('throws when the user is not found', async () => {
      jwtService.verify.mockReturnValue({ userId: 'missing-user' });
      userModel.findById.mockResolvedValue(null);

      await expect(
        service.getAccountFromToken({
          headers: { authorization: 'Bearer valid-token' },
        } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('includes org context when orgId is present in the token', async () => {
      const user = { _id: new mongoose.Types.ObjectId() };
      const org = { _id: new mongoose.Types.ObjectId(), username: 'acme' };

      jwtService.verify.mockReturnValue({
        userId: user._id.toString(),
        orgId: org._id.toString(),
      });
      userModel.findById.mockResolvedValue(user);
      orgModel.findById.mockResolvedValue(org);

      const account = await service.getAccountFromToken({
        headers: { authorization: 'Bearer valid-token' },
      } as any);

      expect(account.org).toBe(org);
      expect(account.isUser).toBe(false);
    });
  });

  describe('permissionCheck', () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const account = new AccountModel({ _id: new mongoose.Types.ObjectId() } as any);

    it('allows admins to access the organization', async () => {
      memberRepository.findOne.mockResolvedValue({ role: Role.Admin });

      await expect(service.permissionCheck(orgId, account)).resolves.toBeUndefined();
      expect(memberRepository.findOne).toHaveBeenCalled();
    });

    it('denies access when the member is missing or not an admin', async () => {
      memberRepository.findOne.mockResolvedValue({ role: Role.Member });

      await expect(service.permissionCheck(orgId, account)).rejects.toBeInstanceOf(
        AccessDeniedException,
      );

      memberRepository.findOne.mockResolvedValue(null);

      await expect(service.permissionCheck(orgId, account)).rejects.toBeInstanceOf(
        AccessDeniedException,
      );
    });
  });
});
