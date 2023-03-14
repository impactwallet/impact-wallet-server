import * as mongooseAutoPopulate from 'mongoose-autopopulate';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { OrgsModule } from './orgs/orgs.module';
import { ApiServiceModule } from './api-service/api.module';
import { MembersModule } from './members/members.module';
import { OffersService } from './offers/offers.service';
import { OffersModule } from './offers/offers.module';


@Module({
  imports: [
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
  ],
  providers: [OffersService],
})

export class AppModule { }


