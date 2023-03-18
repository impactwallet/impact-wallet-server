import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isNil, omitBy } from 'lodash';
import { Model } from 'mongoose';
import { AddMemberToOrgDto } from './dto/members.dto';
import { MembersFilterDto } from './dto/members.filter.dto';
import { Member, MemberDocument } from './schema/member.schema';

@Injectable()
export class MembersService {

  constructor(@InjectModel(Member.name) private memberRepository: Model<MemberDocument>) { }

  async createMember(memberDto: AddMemberToOrgDto): Promise<Member> {
    const member = new this.memberRepository(memberDto);
    return member.save();
  }

  getMembers(filters: MembersFilterDto, populate?: any) {
    const query = omitBy({ ...filters }, isNil);

    return this.memberRepository.find(query).populate(populate);
  }
}
