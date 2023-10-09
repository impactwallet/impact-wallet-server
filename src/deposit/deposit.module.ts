import { Module } from '@nestjs/common';
import { ApiServiceModule } from '../api-service/api.module';
import { DepositService } from './deposit.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Deposit, DepositSchema } from './schema/deposit.schema';
import { Org, OrgSchema } from '../orgs/schema/org.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Deposit.name, schema: DepositSchema },
      { name: Org.name, schema: OrgSchema },
    ]),
    ApiServiceModule,
  ],
  providers: [DepositService],
  exports: [DepositService],
})
export class DepositModule {}
