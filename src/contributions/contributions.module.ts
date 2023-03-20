import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MembersModule } from '../members/members.module';
import { ContributionsService } from './contributions.service';
import { Contribution, ContributionSchema } from './schema/contribution.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contribution.name, schema: ContributionSchema }]),
    MembersModule,
  ],
  providers: [ContributionsService],
  exports: [ContributionsService],
})
export class ContributionsModule {}