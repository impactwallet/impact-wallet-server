import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MembersService } from './members.service';
import { Member, MemberSchema } from './schema/member.schema';
import { ApiServiceModule } from '../api-service/api.module';
import { Org, OrgSchema } from '../orgs/schema/org.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Member.name, schema: MemberSchema }]),
    ApiServiceModule,
  ],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
