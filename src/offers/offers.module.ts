import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Member, MemberSchema } from '../members/schema/member.schema';
import { PaymentModule } from '../payment/payment.module';
import { OffersService } from './offers.service';
import { Offer, OfferSchema } from './schema/offer.schema';
import { SaleOffer, SaleOfferSchema } from './schema/sale-offer.schema';
import { OffersController } from './offers.controller';
import { UsersModule } from '../users/users.module';
import { ApiServiceModule } from '../api-service/api.module';
import { OffersLiteService } from './offers.lite.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Offer.name, schema: OfferSchema },
      { name: Member.name, schema: MemberSchema },
      { name: SaleOffer.name, schema: SaleOfferSchema },
    ]),
    PaymentModule,
    UsersModule,
    ApiServiceModule,
  ],
  controllers: [OffersController],
  providers: [OffersService, OffersLiteService],
  exports: [OffersService, OffersLiteService],
})
export class OffersModule { }
