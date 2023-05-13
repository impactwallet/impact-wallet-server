import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Org, OrgSchema } from './schema/org.schema';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { UsersModule } from 'src/users/users.module';
import { ApiServiceModule } from 'src/api-service/api.module';
import { MembersModule } from 'src/members/members.module';
import { OffersModule } from '../offers/offers.module';
import { S3Module } from 'src/s3/s3.module';
import { PaymentModule } from '../payment/payment.module';
import { OrgsLiteController } from './orgs.controller.lite';
import { OrgsLiteService } from './orgs.service.lite';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Org.name, schema: OrgSchema }]),
    UsersModule,
    MembersModule,
    ApiServiceModule,
    OffersModule,
    S3Module,
    PaymentModule,
  ],
  providers: [OrgsService, OrgsLiteService],
  exports: [OrgsService],
  controllers: [OrgsController, OrgsLiteController],
})
export class OrgsModule { }
