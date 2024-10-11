import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as moment from 'moment';
import { SocialsService } from './socials.service';
import { WalletSocial } from './schema/wallet-social.schema';
import { SocialName } from './enum/social-name.enum';

jest.mock('./clients/twitter', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    generateAuthUrl: jest.fn().mockReturnValue('https://twitter.com/oauth'),
    revokeAccessToken: jest.fn().mockResolvedValue(undefined),
    requestAccessToken: jest.fn().mockResolvedValue(undefined),
    getMyAccount: jest.fn().mockResolvedValue({ myId: '1', myName: 'user' }),
    followDeplan: jest.fn().mockResolvedValue({ data: { following: true } }),
    createTweet: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('SocialsService', () => {
  let service: SocialsService;
  let walletSocialModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };

  beforeEach(async () => {
    walletSocialModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialsService,
        {
          provide: getModelToken(WalletSocial.name),
          useValue: walletSocialModel,
        },
      ],
    }).compile();

    service = module.get<SocialsService>(SocialsService);
  });

  describe('getTwitterClient', () => {
    it('returns a cached client per wallet', () => {
      const first = service.getTwitterClient('wallet-a');
      const second = service.getTwitterClient('wallet-a');
      const other = service.getTwitterClient('wallet-b');

      expect(first).toBe(second);
      expect(first).not.toBe(other);
    });
  });

  describe('twitterFollow', () => {
    it('returns the oauth url from the twitter client', () => {
      expect(service.twitterFollow('wallet-a')).toBe(
        'https://twitter.com/oauth',
      );
    });
  });

  describe('twitterFollowCheck', () => {
    it('returns follow status for recent followers', async () => {
      walletSocialModel.findOne.mockResolvedValue({
        isFollowing: true,
        updatedAt: moment.utc().subtract(1, 'day').toDate(),
      });

      await expect(service.twitterFollowCheck('wallet-a')).resolves.toEqual({
        isFollowing: true,
      });
      expect(walletSocialModel.findOne).toHaveBeenCalledWith({
        wallet: 'wallet-a',
        socialName: SocialName.twitter,
      });
    });

    it('throws when the user is not following or data is stale', async () => {
      walletSocialModel.findOne.mockResolvedValue({
        isFollowing: false,
        updatedAt: moment.utc().subtract(1, 'day').toDate(),
      });

      await expect(service.twitterFollowCheck('wallet-a')).rejects.toMatchObject({
        status: HttpStatus.I_AM_A_TEAPOT,
      });

      walletSocialModel.findOne.mockResolvedValue({
        isFollowing: true,
        updatedAt: moment.utc().subtract(5, 'days').toDate(),
      });

      await expect(service.twitterFollowCheck('wallet-a')).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });
});
