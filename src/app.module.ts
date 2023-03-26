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


@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule,
    UsersModule,
    OrgsModule,
    ApiServiceModule,
    MongooseModule.forRoot(process.env.MONGODB_URI, {
      connectionFactory: (connection) => {
        connection.plugin(mongooseAutoPopulate);
        return connection;
      },
    }),
    MembersModule,
    OffersModule,
    ContributionsModule
  ],
})

export class AppModule { }


