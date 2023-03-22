import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { get, isEmpty } from 'lodash';
import { v4 as uuid } from 'uuid';
import mongoose, { ClientSession, Model, Types } from 'mongoose';
import { ApiService } from 'src/api-service/api.service';
import { UsersService } from 'src/users/users.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsFilter } from './dto/orgs.filter.dto';
import { Org, OrgDocument } from './schema/org.schema';
import { MemberDto } from 'src/members/dto/members.dto';
import { MembersService } from 'src/members/members.service';
import { Member } from 'src/members/schema/member.schema';
import { Request } from 'express';
import { OrgUsernameFilter } from './dto/org-username.filter.dto';
import { MemberEquityDto } from '../members/dto/member-equity.dto';

@Injectable()
export class OrgsService {
  constructor(
    @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private memberService: MembersService,
    private usersService: UsersService,
    private apiService: ApiService
  ) { }

  async createOrg(orgsDto: CreateOrgDto, logo: any, mock: boolean, req: Request) {
    await this.usersService.getUserFromToken(req);
    if (logo) {
      const imageB64 = logo.buffer.toString('base64');
      orgsDto.logo = imageB64;
    }

    const session = await this.connection.startSession();
    const newOrg = new this.orgRepository(orgsDto);

    await session.withTransaction(async () => {
      try {
        await newOrg.save({ session });
      } catch (error) {
        if (error.code === 11000) {
          throw new ConflictException({ error });
        }
        throw new HttpException(error, 400);
      }
      try {
        if (!mock) {
          newOrg.password = uuid();
          newOrg.wallet = await this.apiService.createWallet(newOrg.password);
        }

        await newOrg.save({ session });
      } catch (error) {
        const code = get(error, 'response.status', 400);
        const message = get(error, 'message', '');
        throw new HttpException({ message }, code);
      }

      this.apiService.createFungibleTokensForOrganization(newOrg)
        .then((mint) => {
          return this.orgRepository.findOneAndUpdate(
            { _id: newOrg._id },
            { $set: { mint } },
          );
        })
        .catch((err) => console.error(err));
    });

    await session.endSession();

    return newOrg;
  }

  async getOrgsByQuery(query: OrgsFilter, req: Request) {
    await this.usersService.getUserFromToken(req);

    return this.getOrgsWithFilter(query);
  }

  async getByOrgId(id: string, session?: ClientSession) {
    const org = await this.orgRepository.findById(id, '+password').session(session);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private getOrgsWithFilter(queryParams: OrgsFilter) {

    const dbQuery = {};
    if (queryParams.name) {
      dbQuery['name'] = new RegExp(queryParams.name, 'i');
    }

    return this.orgRepository.find(dbQuery);
  }

  async addMemberToOrg(orgId: string, addMemberToOrg: MemberDto, req: Request): Promise<Member> {
    await this.usersService.getUserFromToken(req);

    addMemberToOrg.org = orgId;
    
    try {
      const member = await this.memberService.createMember(addMemberToOrg);
      return member;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException({ error });
      }
      throw new BadRequestException(error);
    }
  }

  async findOrgByUsername(filters: OrgUsernameFilter) {
    const query = {
      username: { $regex: new RegExp(`^${filters.searchTerm}$`, 'i') },
    };
    const orgs = await this.orgRepository.find(query);
    if (isEmpty(orgs)) {
      throw new NotFoundException();
    }
  }

  async getOrgMembers(orgId: string, req: Request) {
    await this.usersService.getUserFromToken(req);
    const query = {
      org: new Types.ObjectId(orgId),
    };
    return this.memberService.getMembers(query, 'user');
  }

  updateMinted(orgId: string | mongoose.Types.ObjectId, amount: number, session?: ClientSession) {
    return this.orgRepository.updateOne(
      { _id: new mongoose.Types.ObjectId(orgId) },
      { $inc: { lamportsMinted: amount } }
    ).session(session);
  }

  async getMemberEquity(orgId: string, memberId: string): Promise<MemberEquityDto> {
    const org = await this.getByOrgId(orgId);
    const member = await this.memberService.getMemberById(memberId);

    return {
      lamportsEarned: member.lamportsEarned,
      equity: !org.lamportsMinted ? 0 : member.lamportsEarned / org.lamportsMinted,
    };
  }

}
