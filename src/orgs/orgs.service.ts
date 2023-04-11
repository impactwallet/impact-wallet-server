import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { get, isEmpty, isNil, truncate } from 'lodash';
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
import { delay, firstValueFrom, of } from 'rxjs';
import { MintInfoDto } from './dto/mint-info.dto';
import { MintStatus } from './enum/mint-status';
import { resizeBuffer } from '../utils/images';
import { S3Service } from 'src/s3/s3.service';
import { SendUsdcDto } from '../users/dto/send-usdc.dto';

const MINT_STATUS_RETRIES = 5;

@Injectable()
export class OrgsService {
  constructor(
    @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private memberService: MembersService,
    private usersService: UsersService,
    private apiService: ApiService,
    private s3Service: S3Service
  ) { }

  async createOrg(orgsDto: CreateOrgDto, logo: any, mock: boolean, req: Request) {
    await this.usersService.getUserFromToken(req);
    if (logo) {
      const resized = await resizeBuffer(logo.buffer);
      const fileName = `${uuid()}.jpg`;
      await this.s3Service.putFile(fileName, resized);
      orgsDto.logo = `/orgs/logo/${fileName}`;
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
        throw new HttpException(get(error, 'message', error), 400);
      }
      try {
        if (!mock) {
          newOrg.password = uuid();
          newOrg.wallet = await this.apiService.createWallet(newOrg.password);
          this.apiService.sendNotification(`New wallet created for organization ${newOrg.username}:\n\n${newOrg.wallet}\n\n${this.apiService.buildExplorerLink('/address/' + newOrg.wallet)}`);
        }

        await newOrg.save({ session });
      } catch (error) {
        const code = get(error, 'response.status', 400);
        const message = get(error, 'message', error);
        throw new HttpException(message, code);
      }
      orgsDto.member.org = newOrg._id.toString();
      await this.addMemberToOrg(newOrg._id, orgsDto.member, session);
    });

    await session.endSession();

    if (!mock) {
      firstValueFrom(of(true).pipe(delay(5000)))
        .then(() => {
          const mintInfo = { mint: null, mintError: null, mintStatus: MintStatus.inProgress };
          return this.updateMint(newOrg._id, mintInfo);
        })
        .then(() => this.getLogo(newOrg.logo.split('/')[3]))
        .then(({ file }) => this.apiService.createFungibleTokensForOrganization(newOrg, Buffer.from(file)))
        .then((mint) => {
          this.apiService.sendNotification(`New ${truncate(newOrg.username.toUpperCase(), { length: 10 })} token created:\n\n${mint}\n\n${this.apiService.buildExplorerLink('/address/' + mint)}`);
          const mintInfo = { mint, mintError: null, mintStatus: MintStatus.success };
          return this.updateMint(newOrg._id, mintInfo, null);
        })
        .catch((err) => {
          const mintInfo = { mint: null, mintError: get(err, 'message', err), mintStatus: MintStatus.error };
          this.updateMint(newOrg._id, mintInfo).exec();
        });
    }

    return newOrg;
  }

  async getOrgsByQuery(query: OrgsFilter, req: Request) {
    await this.usersService.getUserFromToken(req);

    return this.getOrgsWithFilter(query);
  }

  async getByOrgId(id: string, projection?: string, session?: ClientSession) {
    const org = await this.orgRepository
      .findById(new mongoose.Types.ObjectId(id), projection)
      .session(session);
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

  async addMemberToOrg(
    orgId: string | mongoose.Types.ObjectId,
    addMemberToOrg: MemberDto,
    session?: ClientSession,
  ): Promise<Member> {
    addMemberToOrg.org = orgId.toString();

    try {
      const member = await this.memberService.createMember(addMemberToOrg, session);
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

  updateMintedAmount(orgId: string | mongoose.Types.ObjectId, amount: number, session?: ClientSession) {
    return this.orgRepository.findOneAndUpdate(
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

  updateMint(orgId: string | mongoose.Types.ObjectId, mintInfo: MintInfoDto, session?: ClientSession) {
    return this.orgRepository.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(orgId) },
      { $set: mintInfo },
      { session },
    );
  }

  async ensureMint(orgId: string, session?: ClientSession) {
    await this.ensureMintNotInProgress(orgId, undefined, session);

    const org = await this.getByOrgId(orgId, '+password', session);

    if (!isNil(org.mint) && !isEmpty(org.mint)) {
      return;
    }

    try {
      let mintInfo = { mint: null, mintError: null, mintStatus: MintStatus.inProgress };
      const { file } = await this.getLogo(org.logo.split('/')[3]);
      const mint = await this.apiService.createFungibleTokensForOrganization(org, Buffer.from(file));
      this.apiService.sendNotification(`New ${truncate(org.username.toUpperCase(), { length: 10 })} token created:\n\n${mint}\n\n${this.apiService.buildExplorerLink('/address/' + mint)}`);
      org.mint = mint;
      mintInfo = { mint, mintError: null, mintStatus: MintStatus.success };
      await this.updateMint(org._id, mintInfo, session);
    } catch (err) {
      const mintInfo = { mint: null, mintError: get(err, 'message', err), mintStatus: MintStatus.error };
      this.updateMint(org._id, mintInfo, session);
      throw err;
    }
  }

  async ensureMintNotInProgress(orgId: string, retries = MINT_STATUS_RETRIES, session?: ClientSession) {
    const org = await this.getByOrgId(orgId, null, session);
    if (org.mintStatus === MintStatus.inProgress && retries > 0) {
      await firstValueFrom(of(true).pipe(delay(2000)));
      return this.ensureMintNotInProgress(orgId, --retries, session);
    }
  }

  async getLogo(fileName: string) {
    return this.s3Service.getFile(fileName);
  }

  async getOrgBalance(orgId: string) {
    const org = await this.getByOrgId(orgId);
    return this.apiService.getUSDCBalance(org.wallet);
  }

  async sendUsdc(orgId: string, sendUsdcDto: SendUsdcDto) {
    const org = await this.getByOrgId(orgId, '+password');
    const balance: number = await this.apiService.getUSDCBalance(org.wallet);
    if (balance < sendUsdcDto.amount) {
      throw new BadRequestException('Not enough USDC to send');
    }

    const fromPk = await this.apiService.getPK(org.wallet, org.password);
    const recipients = [
      {
        wallet: sendUsdcDto.recipient,
        amount: sendUsdcDto.amount,
      },
    ];

    const signature = await this.apiService.transferUSDC(fromPk, recipients);
    this.apiService.sendNotification(`Org ${org.username} sent ${sendUsdcDto.amount} USDC to ${sendUsdcDto.recipient}\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);
  }

}
