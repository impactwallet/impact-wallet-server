import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddMemberToOrgDto } from './dto/members.dto';
import { Member, MemberDocument } from './schema/member.schema';

@Injectable()
export class MembersService {

  constructor(@InjectModel(Member.name) private memberRepository: Model<MemberDocument>) { }


  async createMember(memberDto: AddMemberToOrgDto): Promise<Member> {

    const member = new this.memberRepository(memberDto);

    return await member.save();
  }



}
