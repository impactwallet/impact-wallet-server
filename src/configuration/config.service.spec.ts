import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from './config.service';
import { Config } from './schema/config.schema';

describe('ConfigService', () => {
  let service: ConfigService;
  let configRepository: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  beforeEach(async () => {
    configRepository = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: getModelToken(Config.name), useValue: configRepository },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
    process.env.BONUS_WALLET_EXPIRATION_INTERVAL_MIN = '30';
  });

  describe('getConfig', () => {
    it('returns config with bonus wallet expiration from env', async () => {
      configRepository.findOne.mockResolvedValue({
        toObject: () => ({ fee: 5, minDeposit: 10 }),
      });

      const config = await service.getConfig();

      expect(config).toEqual({
        fee: 5,
        minDeposit: 10,
        bonusWalletExpiration: 30,
      });
      expect(configRepository.findOne).toHaveBeenCalledWith({ id: 1 }, { _id: 0 });
    });
  });

  describe('updateConfig', () => {
    it('upserts configuration by id', async () => {
      const dto = { fee: 7, minDeposit: 20 };

      await service.updateConfig(dto as any);

      expect(configRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { id: 1 },
        dto,
        { upsert: true, new: true },
      );
    });
  });
});
