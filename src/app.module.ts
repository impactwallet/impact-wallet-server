import * as mongooseAutoPopulate from 'mongoose-autopopulate';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { OrgsModule } from './orgs/orgs.module';
import { ApiServiceModule } from './api-service/api.module';
import { MembersModule } from './members/members.module';
import { OffersService } from './offers/offers.service';
import { OffersModule } from './offers/offers.module';
import { AuthModule } from './auth/auth.module';


@Module({
  imports: [
    AuthModule,
    UsersModule,
    OrgsModule,
    ApiServiceModule,
    // MongooseModule.forRoot(process.env.MONGODB_URI, {
    MongooseModule.forRoot('mongodb+srv://vitko:jhCn7xn2m2JJ9l8q@cluster0.dg4ud.mongodb.net/?retryWrites=true&w=majority', {
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


