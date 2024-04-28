import * as mongooseAutoPopulate from 'mongoose-autopopulate';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { OrgsModule } from './orgs/orgs.module';
import { ApiServiceModule } from './api-service/api.module';
import { MembersModule } from './members/members.module';
import { OffersModule } from './offers/offers.module';
import { AuthModule } from './auth/auth.module';
import { ContributionsModule } from './contributions/contributions.module';
import { ConfigModule } from '@nestjs/config';
import { ConfigurationModule } from './configuration/config.module';
import { Connection } from 'mongoose';
import { AccountModule } from './account/account.module';
import { JobsModule } from './jobs-service/jobs.module';
import { DepositModule } from './deposit/deposit.module';
import { AirdropModule } from './airdrop/airdrop.module';

export let connection: Connection;

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule,
    UsersModule,
    OrgsModule,
    ApiServiceModule,
    MongooseModule.forRoot(process.env.MONGODB_URI, {
      connectionFactory: (_connection) => {
        connection = _connection;
        _connection.plugin(mongooseAutoPopulate);
        return _connection;
      },
    }),
    MembersModule,
    OffersModule,
    ContributionsModule,
    ConfigurationModule,
    AccountModule,
    JobsModule,
    DepositModule,
    AirdropModule,
  ],
})
export class AppModule {}
