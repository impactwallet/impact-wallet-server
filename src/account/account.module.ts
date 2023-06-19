import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { ApiServiceModule } from '../api-service/api.module';
import { MongooseModule } from '@nestjs/mongoose';
import { SaleOffer, SaleOfferSchema } from '../offers/schema/sale-offer.schema';
import { Org, OrgSchema } from '../orgs/schema/org.schema';
import { Payment, PaymentSchema } from '../payment/schema/payment.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Org.name, schema: OrgSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: SaleOffer.name, schema: SaleOfferSchema },
    ]),
    ApiServiceModule,
    AuthModule,
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}