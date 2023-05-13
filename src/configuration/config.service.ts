import { Injectable, NotFoundException, UnauthorizedException, ConflictException, HttpException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Config, ConfigDocument } from './schema/config.schema';
import { ConfigurationDto } from './dto/configuration.dto';

@Injectable()
export class ConfigService {

  constructor(
    @InjectModel(Config.name) private configRepository: Model<ConfigDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection
  ) { }

  async getConfig() {
    const config = await this.configRepository.findOne({ id: 1 }, { _id: 0 }).exec();
    if (!config) {
      return {
        mode: `Lite`
      }
    }
    return config;
  }

  async updateConfig(configurationDto: ConfigurationDto) {
    const options = { upsert: true, new: true };
    await this.configRepository.findOneAndUpdate({ id: 1 }, configurationDto, options)
  }
}
