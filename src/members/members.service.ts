import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isNil, isUndefined, omitBy } from 'lodash';
import mongoose, { Model } from 'mongoose';
import { MemberDto } from './dto/members.dto';
import { MembersFilterDto } from './dto/members.filter.dto';
import { Member, MemberDocument } from './schema/member.schema';

@Injectable()
export class MembersService {

  constructor(@InjectModel(Member.name) private memberRepository: Model<MemberDocument>) { }

  async createMember(memberDto: MemberDto): Promise<Member> {
    const member = new this.memberRepository(memberDto);
    return member.save();
  }

  getMembers(filters: MembersFilterDto, populate?: any) {
    const query = omitBy({ ...filters }, isUndefined);

    return this.memberRepository.find(query).populate(populate);
  }

  async getMemberById(memberId: string) {
    const member = await this.memberRepository.findById(
      new mongoose.Types.ObjectId(memberId),
    );

    if (isNil(member)) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }
}
