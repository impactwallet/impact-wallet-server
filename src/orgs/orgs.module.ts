import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Org, OrgSchema } from './schema/org.schema';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { UsersModule } from 'src/users/users.module';
import { ApiServiceModule } from 'src/api-service/api.module';
import { MembersModule } from 'src/members/members.module';
import { S3Module } from 'src/s3/s3.module';
import { PaymentModule } from '../payment/payment.module';
import { OrgsLiteController } from './orgs.controller.lite';
import { OrgsServiceLite } from './orgs.service.lite';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { Member, MemberSchema } from '../members/schema/member.schema';
import { Payment, PaymentSchema } from '../payment/schema/payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Org.name, schema: OrgSchema },
      { name: Member.name, schema: MemberSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    UsersModule,
    MembersModule,
    ApiServiceModule,
    S3Module,
    PaymentModule,
    AuthModule,
    JwtModule.register({
      secret: process.env.PRIVATE_KEY || 'SECRET',
    }),
  ],
  providers: [OrgsService, OrgsServiceLite],
  exports: [OrgsService, OrgsServiceLite],
  controllers: [OrgsController, OrgsLiteController],
})
export class OrgsModule {}
