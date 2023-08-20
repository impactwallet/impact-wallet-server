import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Config, ConfigDocument } from './schema/config.schema';
import { ConfigurationDto } from './dto/configuration.dto';

@Injectable()
export class ConfigService {
  constructor(
    @InjectModel(Config.name) private configRepository: Model<ConfigDocument>,
  ) {}

  async getConfig() {
    const config = await this.configRepository.findOne({ id: 1 }, { _id: 0 });
    const configObject = config.toObject();
    configObject.bonusWalletExpiration =
      +process.env.BONUS_WALLET_EXPIRATION_INTERVAL_MIN;
    return configObject;
  }

  async updateConfig(configurationDto: ConfigurationDto) {
    const options = { upsert: true, new: true };
    await this.configRepository.findOneAndUpdate(
      { id: 1 },
      configurationDto,
      options,
    );
  }
}
