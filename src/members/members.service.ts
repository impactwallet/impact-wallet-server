import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { get, isNil, isUndefined, omitBy, set } from 'lodash';
import mongoose, { ClientSession, Model, PopulateOptions } from 'mongoose';
import { MemberDto } from './dto/members.dto';
import { MembersFilterDto } from './dto/members.filter.dto';
import { Member, MemberDocument } from './schema/member.schema';
import { map } from 'bluebird';
import { ApiService } from '../api-service/api.service';

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
  ) {}

  async createMember(memberDto: MemberDto, session?: ClientSession) {
    const member = new this.memberRepository(memberDto);
    return member.save({ session });
  }

  async getMembers(filters: MembersFilterDto, populate?: any) {
    const query = omitBy({ ...filters }, isUndefined);
    const total = await this.memberRepository.find(query).count();
    const members = await this.memberRepository
      .find(query)
      .limit(filters.limit)
      .populate(populate);
    return { list: members, total };
  }

  async getMemberById(
    memberId: string,
    populate?: PopulateOptions | PopulateOptions[],
  ) {
    let query = this.memberRepository.findById(
      new mongoose.Types.ObjectId(memberId),
    );

    if (!isNil(populate)) {
      query = query.populate(populate);
    }

    const member = await query.exec();

    if (isNil(member)) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  updateContributed(
    memberId: string | mongoose.Types.ObjectId,
    duration: number,
    lamportsEarned: number,
    session?: ClientSession,
  ) {
    return this.memberRepository
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(memberId) },
        { $inc: { contributed: duration, lamportsEarned } },
      )
      .session(session);
  }
}
