import { Module } from '@nestjs/common';
import { ApiServiceModule } from '../api-service/api.module';
import { AirdropService } from './airdrop.service';
import { AirdropController } from './airdrop.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Airdrop, AirdropSchema } from './schema/airdrop.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Airdrop.name, schema: AirdropSchema }]),
    ApiServiceModule,
  ],
  providers: [AirdropService],
  controllers: [AirdropController],
  exports: [AirdropService],
})
export class AirdropModule {}
