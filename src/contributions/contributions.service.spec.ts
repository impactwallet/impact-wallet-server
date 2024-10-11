jest.mock('../app.module', () => ({
  connection: {
    model: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import mongoose from 'mongoose';
import { ContributionsService } from './contributions.service';
import { Contribution } from './schema/contribution.schema';
import { MembersService } from '../members/members.service';
import { ApiService } from '../api-service/api.service';
import { OrgsService } from '../orgs/orgs.service';
import { AccountModel } from '../auth/models/account.model';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let contributionModel: Record<string, jest.Mock>;
  let orgsService: { getByOrgId: jest.Mock };
  let membersService: { getMemberById: jest.Mock };

  beforeEach(async () => {
    contributionModel = {
      aggregate: jest.fn(),
      find: jest.fn(),
    };
    orgsService = { getByOrgId: jest.fn() };
    membersService = { getMemberById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        {
          provide: getModelToken(Contribution.name),
          useValue: contributionModel,
        },
        { provide: getConnectionToken(), useValue: {} },
        { provide: MembersService, useValue: membersService },
        { provide: ApiService, useValue: {} },
        { provide: OrgsService, useValue: orgsService },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
  });

  describe('getContributions', () => {
    it('builds an aggregation pipeline with org filter', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();
      contributionModel.aggregate.mockResolvedValue([]);

      await service.getContributions({ orgId } as any);

      expect(contributionModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              org: new mongoose.Types.ObjectId(orgId),
            },
          },
        ]),
      );
    });

    it('filters stopped contributions when requested', async () => {
      contributionModel.aggregate.mockResolvedValue([]);

      await service.getContributions({ isStopped: 'true' } as any);

      const pipeline = contributionModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.stoppedAt).toEqual({
        $type: mongoose.mongo.BSONType.date,
      });
    });
  });

  describe('startContribution', () => {
    const orgId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    it('creates a contribution for the authenticated member', async () => {
      const org = { _id: orgId };
      const member = {
        org: orgId,
        user: { _id: userId },
        impactRatio: 1.5,
      };
      const savedContribution = {
        populate: jest.fn().mockResolvedValue({ _id: 'contrib-1' }),
      };

      orgsService.getByOrgId.mockResolvedValue(org);
      membersService.getMemberById.mockResolvedValue(member);
      contributionModel.find.mockResolvedValue([]);
      const save = jest.fn().mockResolvedValue(savedContribution);
      (service as any).contributionModel = Object.assign(
        jest.fn().mockImplementation(() => ({ save })),
        contributionModel,
      );

      const account = new AccountModel({ _id: userId } as any);
      const result = await service.startContribution(
        orgId.toString(),
        { memberId: memberId.toString() } as any,
        account,
      );

      expect(result).toEqual({ _id: 'contrib-1' });
      expect(savedContribution.populate).toHaveBeenCalledWith('org');
    });

    it('rejects when starting a contribution for another user', async () => {
      orgsService.getByOrgId.mockResolvedValue({ _id: orgId });
      membersService.getMemberById.mockResolvedValue({
        org: orgId,
        user: { _id: new mongoose.Types.ObjectId() },
      });

      const account = new AccountModel({ _id: userId } as any);

      await expect(
        service.startContribution(
          orgId.toString(),
          { memberId: memberId.toString() } as any,
          account,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when member belongs to a different org', async () => {
      orgsService.getByOrgId.mockResolvedValue({ _id: orgId });
      membersService.getMemberById.mockResolvedValue({
        org: new mongoose.Types.ObjectId(),
        user: { _id: userId },
      });

      const account = new AccountModel({ _id: userId } as any);

      await expect(
        service.startContribution(
          orgId.toString(),
          { memberId: memberId.toString() } as any,
          account,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when an active contribution already exists', async () => {
      orgsService.getByOrgId.mockResolvedValue({ _id: orgId });
      membersService.getMemberById.mockResolvedValue({
        org: orgId,
        user: { _id: userId },
      });
      contributionModel.find.mockResolvedValue([{ _id: 'existing' }]);

      const account = new AccountModel({ _id: userId } as any);

      await expect(
        service.startContribution(
          orgId.toString(),
          { memberId: memberId.toString() } as any,
          account,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when organization is not found', async () => {
      orgsService.getByOrgId.mockResolvedValue(null);

      const account = new AccountModel({ _id: userId } as any);

      await expect(
        service.startContribution(
          orgId.toString(),
          { memberId: memberId.toString() } as any,
          account,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
