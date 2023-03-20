import mongoose, { Model } from 'mongoose';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Contribution } from './schema/contribution.schema';
import { StartContributionDto } from './dto/start-contribution.dto';
import { MembersService } from '../members/members.service';
import { areObjectIdsEqual } from '../utils/mongo';
import { isEmpty } from 'lodash';

@Injectable()
export class ContributionsService {
  constructor(
    @InjectModel(Contribution.name) private readonly contributionModel: Model<Contribution>,
    private readonly membersService: MembersService,
  ) {}

  async startContribution(orgId: string, body: StartContributionDto) {
    const { memberId } = body;

    const member = await this.membersService.getMemberById(memberId);

    if (!areObjectIdsEqual(member.org, orgId)) {
      throw new ForbiddenException('Member does not belong to the organisation');
    }

    const existingContributions = await this.contributionModel.find({
      member: new mongoose.Types.ObjectId(memberId),
      org: new mongoose.Types.ObjectId(orgId),
      stoppedAt: null,
    });

    if (!isEmpty(existingContributions)) {
      throw new ConflictException('There are already active contributions');
    }

    const contribution = new this.contributionModel({
      member: memberId,
      org: orgId,
      impactRatio: member.impactRatio,
    });

    try {
      return await contribution.save();
    } catch (error) {
      throw new BadRequestException({ error });
    }
  }
}