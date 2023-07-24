import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Member, MemberSchema } from '../members/schema/member.schema';
import { PaymentModule } from '../payment/payment.module';
import { OffersService } from './offers.service';
import { MemberProspect, MemberProspectSchema, Offer, OfferSchema } from './schema/offer.schema';
import { SaleOffer, SaleOfferSchema } from './schema/sale-offer.schema';
import { OffersController } from './offers.controller';
import { UsersModule } from '../users/users.module';
import { ApiServiceModule } from '../api-service/api.module';
import { OffersLiteService } from './offers.service.lite';
import { OffersControllerLite } from './offers.controller.lite';
import { AuthModule } from '../auth/auth.module';
import { OrgsModule } from '../orgs/orgs.module';
import { Org, OrgSchema } from '../orgs/schema/org.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Offer.name, schema: OfferSchema },
      { name: Member.name, schema: MemberSchema },
      { name: MemberProspect.name, schema: MemberProspectSchema },
      { name: SaleOffer.name, schema: SaleOfferSchema },
      { name: Org.name, schema: OrgSchema },
    ]),
    PaymentModule,
    UsersModule,
    ApiServiceModule,
    AuthModule,
    OrgsModule,
  ],
  controllers: [OffersController, OffersControllerLite],
  providers: [OffersService, OffersLiteService],
  exports: [OffersService, OffersLiteService],
})
export class OffersModule { }
