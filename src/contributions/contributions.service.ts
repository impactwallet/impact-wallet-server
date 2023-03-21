import mongoose, { ClientSession, Model } from 'mongoose';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Contribution, ContributionDocument } from './schema/contribution.schema';
import { StartContributionDto } from './dto/start-contribution.dto';
import { MembersService } from '../members/members.service';
import { areObjectIdsEqual } from '../utils/mongo';
import { isEmpty, isNil } from 'lodash';
import { UserDocument } from '../users/schema/user.schema';
import { MemberDocument } from '../members/schema/member.schema';
import * as moment from 'moment';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ApiService } from '../api-service/api.service';
import { OrgDocument } from '../orgs/schema/org.schema';
import { ContributionsFilterDto } from './dto/contributions-filter.dto';

@Injectable()
export class ContributionsService {
  constructor(
    @InjectModel(Contribution.name) private readonly contributionModel: Model<ContributionDocument>,
    private readonly membersService: MembersService,
    private readonly apiService: ApiService,
  ) {}

  getContributions(filter: ContributionsFilterDto) {
    const query = {};
    const pipelines: any[] = [{ $match: query }];

    if (!isNil(filter.orgId)) {
      query['org'] = new mongoose.Types.ObjectId(filter.orgId);
    }
    if (!isNil(filter.isStopped)) {
      if (filter.isStopped === 'true') {
        query['stoppedAt'] = { $type: mongoose.mongo.BSONType.date };
      } else if (filter.isStopped === 'false') {
        query['stoppedAt'] = null;
      }
    }
    if (!isNil(filter.userId)) {
      pipelines.push(
        {
          $lookup: {
            from: 'members',
            localField: 'member',
            foreignField: '_id',
            as: 'member',
          },
        },
        { $addFields: { member: { $first: '$member' } } },
        { $match: { 'member.user': new mongoose.Types.ObjectId(filter.userId) } }
      );
    }

    return this.contributionModel.aggregate(pipelines);
  }

  async startContribution(orgId: string, body: StartContributionDto, user: UserDocument) {
    const { memberId } = body;

    const member = await this.membersService.getMemberById(memberId, { path: 'user' });
    const memberUser: UserDocument = member.user as UserDocument;

    if (!areObjectIdsEqual(memberUser._id, user._id)) {
      throw new UnauthorizedException('It is not allowed to start contribution for another user');
    }

    if (!areObjectIdsEqual(member.org, orgId)) {
      throw new ForbiddenException('Member does not belong to the organisation');
    }

    const existingContributions = await this.contributionModel.find({
      member: new mongoose.Types.ObjectId(memberId),
      org: new mongoose.Types.ObjectId(orgId),
      stoppedAt: null,
    });

    if (!isEmpty(existingContributions)) {
      throw new ForbiddenException('There are already active contributions');
    }

    const contribution = new this.contributionModel({
      member: memberId,
      org: orgId,
      impactRatio: member.impactRatio,
    });

    try {
      return (await contribution.save()).populate('org');
    } catch (error) {
      throw new BadRequestException({ error });
    }
  }

  async stopContribution(
    orgId: string,
    contributionId: string,
    user: UserDocument,
    session?: ClientSession,
  ): Promise<ContributionDocument> {
    const contribution = await this.contributionModel.findOne({
      _id: new mongoose.Types.ObjectId(contributionId),
      org: new mongoose.Types.ObjectId(orgId),
    })
      .populate([
        { path: 'member', populate: 'user' },
        { path: 'org', select: '+password' },
      ])
      .session(session);

    if (isNil(contribution)) {
      throw new NotFoundException('Contribution not found');
    }

    if (!isNil(contribution.stoppedAt)) {
      throw new ForbiddenException('Contribution already stopped');
    }

    const org: OrgDocument = contribution.org as OrgDocument;
    const member: MemberDocument = contribution.member as MemberDocument;
    const memberUser: UserDocument = member.user as UserDocument;

    if (!areObjectIdsEqual(user._id, memberUser._id)) {
      throw new UnauthorizedException('It is not allowed to stop contribution for another user');
    }

    contribution.stoppedAt = new Date();

    const stoppedAtMoment = moment(contribution.stoppedAt);
    const diff = moment(stoppedAtMoment).diff(contribution.createdAt, 'milliseconds');
    const duration = moment.duration(diff).asHours();
    const lamportsEarned = Math.round(duration * contribution.impactRatio * LAMPORTS_PER_SOL);
    contribution.lamportsEarned = lamportsEarned;

    const txnHash = await this.apiService.mintToken(org, memberUser.wallet, lamportsEarned / LAMPORTS_PER_SOL);
    contribution.txnHash = txnHash;

    await this.membersService.updateContributed(member._id, duration, lamportsEarned, session);
    await contribution.save({ session });

    return this.contributionModel.findById(contribution._id).session(session);
  }
}