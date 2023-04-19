import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiServiceModule } from '../api-service/api.module';
import { Member, MemberSchema } from '../members/schema/member.schema';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment, PaymentSchema } from './schema/payment.schema';
import { SaleOffer, SaleOfferSchema } from '../offers/schema/sale-offer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Member.name, schema: MemberSchema },
      { name: SaleOffer.name, schema: SaleOfferSchema },
    ]),
    ApiServiceModule,
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
  exports: [PaymentService],
})
export class PaymentModule { }