import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MembersService } from './members.service';
import { Member, MemberSchema } from './schema/member.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Member.name, schema: MemberSchema }])],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule { }
