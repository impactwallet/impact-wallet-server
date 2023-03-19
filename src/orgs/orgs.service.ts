import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { get, isEmpty } from 'lodash';
import { v4 as uuid } from 'uuid';
import mongoose, { Model, Types } from 'mongoose';
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
import { firstValueFrom, of, delay } from 'rxjs';

@Injectable()
export class OrgsService {
  constructor(
    @InjectModel(Org.name) private orgRepository: Model<OrgDocument>,
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
          // wait here because Shyft allows 1 request/ses in free plan
          await firstValueFrom(of(null).pipe(delay(3000)));
          newOrg.mint = await this.apiService.createFungibleTokensForOrganization(newOrg);
        }

        await newOrg.save({ session });
      } catch (error) {
        const code = get(error, 'response.status', 400);
        const message = get(error, 'message', '');
        throw new HttpException({ message }, code);
      }
    });

    await session.endSession();

    return newOrg;
  }

  async getOrgsByQuery(query: OrgsFilter, req: Request) {
    await this.usersService.getUserFromToken(req);

    return this.getOrgsWithFilter(query);
  }

  async getByOrgId(id: string) {
    const org = await this.orgRepository.findById(id);
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

  async findOrgByUsername(filters: OrgUsernameFilter, req: Request) {
    await this.usersService.getUserFromToken(req);
    const query = {
      username: filters.searchTerm,
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

}
