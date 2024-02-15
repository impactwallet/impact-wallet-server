import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { defaultTo, get, isEmpty, isNil, isUndefined, omitBy } from 'lodash';
import mongoose, { ClientSession, Model, PopulateOptions } from 'mongoose';
import { MemberDto } from './dto/members.dto';
import { MembersFilterDto } from './dto/members.filter.dto';
import { Member, MemberDocument } from './schema/member.schema';
import { mapSeries } from 'bluebird';
import { ApiService } from '../api-service/api.service';
import { OrgDocument } from '../orgs/schema/org.schema';
import { UserDocument } from '../users/schema/user.schema';
import { toBigJs } from '../utils/bigjs';
import Bigjs from 'big.js';

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    private apiService: ApiService,
  ) {}

  async createMember(memberDto: MemberDto, session?: ClientSession) {
    const member = new this.memberRepository(memberDto);
    return member.save({ session });
  }

  async getMembers(filters: MembersFilterDto, populate?: any, sort: any = {}) {
    const customFilterProps = ['limit', 'equity'];
    const query = omitBy(filters, (filter) => {
      return isUndefined(filter) || customFilterProps.includes(filter);
    });
    let members = await this.memberRepository
      .find(query)
      .sort(sort)
      .populate(populate)
      .populate('user orgUser');
    let total = members.length;
    if (!isNil(filters.equity)) {
      const applyFilter = (equity: Bigjs) => {
        const { gt, lt } = filters.equity;
        return (isNil(gt) || equity.gt(gt)) && (isNil(lt) || equity.lt(lt));
      };
      const orgToHoldersMap = new Map<string, any>();
      await mapSeries(members, async (member) => {
        await member.populate('org');
        const org = member.org as OrgDocument;
        if (
          isNil(org.mint) ||
          !isNil(orgToHoldersMap.get(org._id.toString()))
        ) {
          return;
        }
        const orgHolders = await this.apiService.getTokenHolders(org.mint);
        orgToHoldersMap.set(org._id.toString(), orgHolders);
      });
      const allFilteredHolders = Array.from(orgToHoldersMap.values()).reduce(
        (acc, holders) => {
          const orgFilteredHolders = holders.filter((holder: any) => {
            const equity = toBigJs(
              get(
                holder,
                'account.data.parsed.info.tokenAmount.uiAmountString',
              ),
            );
            return applyFilter(equity);
          });
          return acc.concat(orgFilteredHolders);
        },
        [],
      );
      total = allFilteredHolders.length;

      members = members.filter((member) => {
        const orgId = get(member, 'org._id', member.org);
        const memberUser = defaultTo(
          member.user as UserDocument,
          member.orgUser as OrgDocument,
        );
        const orgHolders = orgToHoldersMap.get(orgId.toString());
        if (isEmpty(orgHolders)) {
          return false;
        }
        const holder = orgHolders.find((holder: any) => {
          return (
            get(holder, 'account.data.parsed.info.owner') === memberUser.wallet
          );
        });
        const equity = toBigJs(
          get(holder, 'account.data.parsed.info.tokenAmount.uiAmountString'),
        );
        return applyFilter(equity);
      });
    }
    if (!isNil(filters.limit)) {
      members = members.slice(0, filters.limit);
    }
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
