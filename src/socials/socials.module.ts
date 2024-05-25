import { Module } from '@nestjs/common';
import { SocialsController } from './socials.controller';
import { SocialsService } from './socials.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WalletSocial,
  WalletSocialSchema,
} from './schema/wallet-social.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WalletSocial.name, schema: WalletSocialSchema },
    ]),
  ],
  controllers: [SocialsController],
  providers: [SocialsService],
  exports: [SocialsService],
})
export class SocialsModule {}
