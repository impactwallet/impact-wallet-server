import { Module } from '@nestjs/common';
import { ApiServiceModule } from '../api-service/api.module';
import { AirdropService } from './airdrop.service';
import { AirdropController } from './airdrop.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Airdrop, AirdropSchema } from './schema/airdrop.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Airdrop.name, schema: AirdropSchema }]),
    ApiServiceModule,
    UsersModule,
  ],
  providers: [AirdropService],
  controllers: [AirdropController],
  exports: [AirdropService],
})
export class AirdropModule {}
