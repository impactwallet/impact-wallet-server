import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiServiceModule } from '../api-service/api.module';
import { MembersModule } from '../members/members.module';
import { ContributionsService } from './contributions.service';
import { Contribution, ContributionSchema } from './schema/contribution.schema';
import { ContributionsController } from './contributions.controller';
import { OrgsModule } from '../orgs/orgs.module';
import { UsersModule } from '../users/users.module';
import { ContributionsServiceLite } from './contributions.service.lite';
import { ContributionsControllerLite } from './contributions.controller.lite';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contribution.name, schema: ContributionSchema }]),
    MembersModule,
    ApiServiceModule,
    OrgsModule,
    UsersModule,
  ],
  providers: [ContributionsService, ContributionsServiceLite],
  controllers: [ContributionsController, ContributionsControllerLite],
})
export class ContributionsModule {}