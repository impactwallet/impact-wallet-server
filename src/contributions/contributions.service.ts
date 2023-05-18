import mongoose, { Connection, Model } from 'mongoose';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';

import { Contribution, ContributionDocument, ContributionSplit } from './schema/contribution.schema';
import { StartContributionDto } from './dto/start-contribution.dto';
import { MembersService } from '../members/members.service';
import { areObjectIdsEqual } from '../utils/mongo';
import { get, isEmpty, isNil } from 'lodash';
import { UserDocument } from '../users/schema/user.schema';
import { MemberDocument } from '../members/schema/member.schema';
import * as moment from 'moment';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ApiService } from '../api-service/api.service';
import { OrgDocument } from '../orgs/schema/org.schema';
import { ContributionsFilterDto } from './dto/contributions-filter.dto';
import { Role } from '../members/enum/roles.enum';
import { StopContributionDto } from './dto/stop-contribution.dto';
import { OrgsService } from '../orgs/orgs.service';

@Injectable()
export class ContributionsService {
  constructor(
    @InjectModel(Contribution.name) private readonly contributionModel: Model<ContributionDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly membersService: MembersService,
    private readonly apiService: ApiService,
    private readonly orgsService: OrgsService,
  ) { }

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

    pipelines.push(
      {
        $lookup: {
          from: 'orgs',
          localField: 'org',
          foreignField: '_id',
          as: 'org',
        },
      },
      { $addFields: { org: { $first: '$org' } } },
    );

    return this.contributionModel.aggregate(pipelines);
  }

  async startContribution(orgId: string, body: StartContributionDto, user: UserDocument) {
    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

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
    body: StopContributionDto,
  ): Promise<ContributionDocument> {
    const org = await this.orgsService.getByOrgId(orgId, '+password');

    await this.orgsService.ensureMint(orgId);

    let contribution: ContributionDocument;

    const session = await this.connection.startSession();
    await session.withTransaction(async () => {
      contribution = await this.contributionModel.findOne({
        _id: new mongoose.Types.ObjectId(contributionId),
        org: new mongoose.Types.ObjectId(orgId),
      })
        .populate([
          { path: 'member', populate: 'user' },
          'org',
        ])
        .session(session);

      if (isNil(contribution)) {
        throw new NotFoundException({
          message: 'Contribution not found',
        });
      }

      if (!isNil(contribution.stoppedAt)) {
        throw new ForbiddenException({
          message: 'Contribution already stopped',
          contribution,
        });
      }

      const member: MemberDocument = contribution.member as MemberDocument;
      const memberUser: UserDocument = member.user as UserDocument;

      if (!areObjectIdsEqual(user._id, memberUser._id)) {
        throw new UnauthorizedException({
          message: 'It is not allowed to stop contribution for another user',
        });
      }

      const stoppedAt = new Date();
      contribution.stoppedAt = stoppedAt;

      const stoppedAtMoment = moment(stoppedAt);
      const diff = moment(stoppedAtMoment).diff(contribution.createdAt, 'milliseconds');
      const duration = moment.duration(diff).asHours();
      let lamportsEarned = Math.round(duration * contribution.impactRatio * LAMPORTS_PER_SOL);
      contribution.lamportsEarned = lamportsEarned;

      const investorsShares = await this._calculateAndUpdateInvestorsShares(org, lamportsEarned);
      const split = investorsShares.receivers;
      lamportsEarned -= investorsShares.total;
      split.push({
        member,
        wallet: memberUser.wallet,
        amount: lamportsEarned,
        duration,
      });
      contribution.split = split;

      contribution.txnStatus = 'processing';
      const promises = split.map(data => {
        return this.membersService.updateContributed((data.member as MemberDocument)._id, data.duration, data.amount, session).exec();
      });
      await Promise.all(promises);
      await contribution.save({ session });
      await this.orgsService.updateMintedAmount(orgId, contribution.lamportsEarned, session);
    });
    await session.endSession();

    this.mintAndConfirmWithRetryAndReverse(org, contribution, body);

    return contribution;
  }

  async mintAndConfirmWithRetryAndReverse(org: OrgDocument, contribution: ContributionDocument, body: StopContributionDto) {
    try {
      const mintContributionTokensFn = this.mintContributionTokens.bind(this, org, contribution, body.memo);
      let txnHash = await mintContributionTokensFn();
      txnHash = await this.apiService.confirmTxnWithRetry(txnHash, mintContributionTokensFn);
      contribution.txnHash = txnHash;

      contribution.txnStatus = 'confirmed';
      const nicknames = contribution.split
        .map(
          ({ member }) => ((member as MemberDocument).user as UserDocument).nickname
        )
        .join(', ');
      this.apiService.sendNotification(
        `Tokens ${org.username.toUpperCase()} minted ant sent to members: ${nicknames}:\n\n${txnHash}\n\n${this.apiService.buildExplorerLink('/tx/' + txnHash)}`
      );
    } catch (err) {
      contribution.txnError = err.message;
      contribution.txnStatus = 'failed';
      try {
        const session = await this.connection.startSession();
        await session.withTransaction(async () => {
          const promises: Promise<any>[] = contribution.split.map(data => {
            return this.membersService.updateContributed(
              (data.member as MemberDocument)._id,
              -data.duration,
              -data.amount,
              session,
            ).exec();
          });
          promises.push(this.orgsService.updateMintedAmount(org._id, -contribution.lamportsEarned, session).exec());
          await Promise.all(promises);
        });
        await session.endSession();
        contribution.txnStatus = 'reverted';
      } catch (err_1) {
        console.log(err_1);
      }
    }

    return contribution.save();
  }

  async mintContributionTokens(org: OrgDocument, contribution: ContributionDocument, memo?: string) {
    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    return this.apiService.mintToken(org.mint, orgPk, contribution.split, memo);
  }

  async _calculateAndUpdateInvestorsShares(org: OrgDocument, lamportsEarned: number) {
    const receivers: ContributionSplit[] = [];
    let total = 0;
    const investors = await this.membersService.getMembers({
      org: org._id,
      role: Role.Investor,
    }, 'user');
    investors.forEach(investor => {
      const investorShare = Math.round(lamportsEarned * (investor.investorSettings.equityAllocation / 100));
      total += investorShare;
      receivers.push({
        member: investor,
        wallet: (investor.user as UserDocument).wallet,
        amount: investorShare,
        duration: 0,
      });
    });
    return { receivers, total };
  }
}