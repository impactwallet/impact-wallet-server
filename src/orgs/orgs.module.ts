import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Org, OrgSchema } from './schema/org.schema';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { UsersModule } from 'src/users/users.module';
import { ApiServiceModule } from 'src/api-service/api.module';
import { MembersModule } from 'src/members/members.module';
import { OffersModule } from '../offers/offers.module';
import { ContributionsModule } from '../contributions/contributions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Org.name, schema: OrgSchema }]),
    UsersModule,
    MembersModule,
    ApiServiceModule,
    OffersModule,
    ContributionsModule,
  ],
  providers: [OrgsService],
  controllers: [OrgsController],
})
export class OrgsModule { }
