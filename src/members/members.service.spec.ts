import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { MembersService } from './members.service';
import { Member } from './schema/member.schema';
import { ApiService } from '../api-service/api.service';

describe('MembersService', () => {
  let service: MembersService;
  let memberRepository: Record<string, jest.Mock>;
  let apiService: { getTokenHolders: jest.Mock };

  beforeEach(async () => {
    memberRepository = {
      find: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    apiService = { getTokenHolders: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: getModelToken(Member.name), useValue: memberRepository },
        { provide: ApiService, useValue: apiService },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);
  });

  describe('createMember', () => {
    it('creates and saves a member', async () => {
      const memberDto = { org: new mongoose.Types.ObjectId(), role: 'Member' };
      const savedMember = { ...memberDto, _id: new mongoose.Types.ObjectId() };
      const save = jest.fn().mockResolvedValue(savedMember);
      (service as any).memberRepository = Object.assign(
        jest.fn().mockImplementation(() => ({ save })),
        memberRepository,
      );

      const result = await service.createMember(memberDto as any);

      expect(save).toHaveBeenCalledWith({ session: undefined });
      expect(result).toBe(savedMember);
    });
  });

  describe('getMembers', () => {
    it('returns members without equity filtering', async () => {
      const members = [{ _id: '1' }, { _id: '2' }];
      memberRepository.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(members),
          }),
        }),
      });

      const result = await service.getMembers({ org: 'org-id' } as any);

      expect(result).toEqual({ list: members, total: 2 });
    });

    it('applies limit when provided', async () => {
      const members = [{ _id: '1' }, { _id: '2' }, { _id: '3' }];
      memberRepository.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(members),
          }),
        }),
      });

      const result = await service.getMembers({ limit: 2 } as any);

      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('getMemberById', () => {
    const memberId = new mongoose.Types.ObjectId().toString();

    it('returns the member when found', async () => {
      const member = { _id: memberId, role: 'Admin' };
      memberRepository.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(member),
      });

      await expect(service.getMemberById(memberId)).resolves.toBe(member);
    });

    it('returns the member when populate options are provided', async () => {
      const member = { _id: memberId, role: 'Admin' };
      memberRepository.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(member),
        }),
      });

      await expect(
        service.getMemberById(memberId, [{ path: 'user' }]),
      ).resolves.toBe(member);
    });

    it('throws when the member does not exist', async () => {
      memberRepository.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getMemberById(memberId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateContributed', () => {
    it('increments contributed and lamportsEarned', async () => {
      const memberId = new mongoose.Types.ObjectId();
      const session = {} as any;
      const chain = { session: jest.fn().mockReturnValue('updated') };
      memberRepository.findOneAndUpdate.mockReturnValue(chain);

      const result = await service.updateContributed(memberId, 5, 1000, session);

      expect(memberRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: memberId },
        { $inc: { contributed: 5, lamportsEarned: 1000 } },
      );
      expect(chain.session).toHaveBeenCalledWith(session);
      expect(result).toBe('updated');
    });
  });
});
