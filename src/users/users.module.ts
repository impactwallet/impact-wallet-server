import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiServiceModule } from 'src/api-service/api.module';
import { S3Module } from 'src/s3/s3.module';
import { MembersModule } from '../members/members.module';
import { User, UserSchema } from './schema/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Member, MemberSchema } from 'src/members/schema/member.schema';
import { Org, OrgSchema } from '../orgs/schema/org.schema';
import { Payment, PaymentSchema } from '../payment/schema/payment.schema';
import { Contribution, ContributionSchema } from '../contributions/schema/contribution.schema';
import { SaleOffer, SaleOfferSchema } from '../offers/schema/sale-offer.schema';

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
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule { }
