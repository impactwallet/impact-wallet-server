import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { OffersService } from './offers.service';
import { Offer, OfferSchema } from './schema/offer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Offer.name, schema: OfferSchema }]),
    UsersModule,
  ],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
