import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from './config.service';
import { Config, ConfigSchema } from './schema/config.schema';
import { ConfigController } from './config.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Config.name, schema: ConfigSchema }
    ]),
    UsersModule
  ],
  providers: [ConfigService],
  controllers: [ConfigController],
  exports: [ConfigService],
})
export class ConfigurationModule { }
