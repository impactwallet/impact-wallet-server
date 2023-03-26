import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiServiceModule } from 'src/api-service/api.module';
import { S3Module } from 'src/s3/s3.module';
import { ContributionsModule } from '../contributions/contributions.module';
import { MembersModule } from '../members/members.module';
import { User, UserSchema } from './schema/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({
      secret: process.env.PRIVATE_KEY || 'SECRET',
    }),
    ApiServiceModule,
    MembersModule,
    ContributionsModule,
    S3Module,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule { }
