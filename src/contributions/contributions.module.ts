import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiServiceModule } from '../api-service/api.module';
import { MembersModule } from '../members/members.module';
import { ContributionsService } from './contributions.service';
import { Contribution, ContributionSchema } from './schema/contribution.schema';
import { ContributionsController } from './contributions.controller';
import { OrgsModule } from '../orgs/orgs.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contribution.name, schema: ContributionSchema }]),
    MembersModule,
    ApiServiceModule,
    OrgsModule,
    UsersModule,
  ],
  providers: [ContributionsService],
  controllers: [ContributionsController],
})
export class ContributionsModule {}