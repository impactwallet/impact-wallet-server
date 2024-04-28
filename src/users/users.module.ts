import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MembersModule } from '../members/members.module';
import { User, UserSchema } from './schema/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Org, OrgSchema } from '../orgs/schema/org.schema';
import { Payment, PaymentSchema } from '../payment/schema/payment.schema';
import {
  Contribution,
  ContributionSchema,
} from '../contributions/schema/contribution.schema';
import { SaleOffer, SaleOfferSchema } from '../offers/schema/sale-offer.schema';
import { UsersServiceLite } from './users.service.lite';
import { UsersControllerLite } from './users.controller.lite';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { ApiServiceModule } from '../api-service/api.module';
import { S3Module } from '../s3/s3.module';
import { Member, MemberSchema } from '../members/schema/member.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Member.name, schema: MemberSchema },
      { name: Org.name, schema: OrgSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Contribution.name, schema: ContributionSchema },
      { name: SaleOffer.name, schema: SaleOfferSchema },
    ]),
    JwtModule.register({
      secret: process.env.PRIVATE_KEY || 'SECRET',
    }),
    ApiServiceModule,
    MembersModule,
    S3Module,
    AuthModule,
  ],
  providers: [UsersService, UsersServiceLite],
  controllers: [UsersController, UsersControllerLite],
  exports: [UsersService, UsersServiceLite],
})
export class UsersModule {}
