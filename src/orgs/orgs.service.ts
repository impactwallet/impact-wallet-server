import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { get, identity, isEmpty, isNil, pickBy, truncate } from 'lodash';
import { v4 as uuid } from 'uuid';
import mongoose, { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { ApiService } from 'src/api-service/api.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsFilter } from './dto/orgs.filter.dto';
import { Org, OrgDocument } from './schema/org.schema';
import { MemberDto } from 'src/members/dto/members.dto';
import { MembersService } from 'src/members/members.service';
import { MemberDocument } from 'src/members/schema/member.schema';
import { Request } from 'express';
import { OrgUsernameFilter } from './dto/org-username.filter.dto';
import { MemberEquityDto } from '../members/dto/member-equity.dto';
import { delay, firstValueFrom, of } from 'rxjs';
import { MintInfoDto } from './dto/mint-info.dto';
import { MintStatus } from './enum/mint-status.enum';
import { resizeBuffer } from '../utils/images';
import { S3Service } from 'src/s3/s3.service';
import { SendUsdcDto } from '../users/dto/send-usdc.dto';
import { Role } from '../members/enum/roles.enum';
import { OrgHistoryItemAction } from './enum/org-history-item-action.enum';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AuthService } from '../auth/auth.service';
import { AccountModel } from '../auth/models/account.model';
import { JwtService } from '@nestjs/jwt';

const MINT_STATUS_RETRIES = 5;

@Injectable()
export class OrgsService {
  constructor(
    @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
    @InjectModel(Org.name) public membersRepository: Model<MemberDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private memberService: MembersService,
    private authService: AuthService,
    private apiService: ApiService,
    private s3Service: S3Service,
    private jwtService: JwtService,
  ) { }

  async createOrg(orgsDto: CreateOrgDto, logo: any, mock: boolean, req: Request) {
    await this.authService.getAccountFromToken(req);
    const { org } = await this.createOrganization(orgsDto, logo, mock);
    if (!mock) this.createToken(org);
    return {
      "_id": org._id,
      "username": org.username,
      "name": org.name,
      "logo": org.logo,
      "settings": org.settings,
      "lamportsMinted": org.lamportsMinted,
      "wallet": org.wallet,
    };
  }

  async createToken(org: OrgDocument, initialMint?: { wallet: string, amount: number }) {

    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      let mintInfo = { mint: null, mintError: null, mintStatus: MintStatus.inProgress };
      await this.updateMint(org._id, mintInfo);
      const { file } = await this.getLogo(org.logo.split('/')[3]);
      const createTokenFn = this.apiService.createFungibleTokensForOrganization.bind(this.apiService, org, Buffer.from(file));
      const { mint, txnHash } = await createTokenFn();
      await this.apiService.confirmTxnWithRetry(txnHash, createTokenFn);
      this.apiService.sendNotification(`New ${org.username.toUpperCase().substring(0, 10)} token created:\n\n${mint}\n\n${this.apiService.buildExplorerLink('/address/' + mint)}`);

      mintInfo = { mint, mintError: null, mintStatus: MintStatus.success };
      await this.updateMint(org._id, mintInfo, null);
      org.mint = mint;
    } catch (err) {
      const mintInfo = { mint: null, mintError: get(err, 'message', err), mintStatus: MintStatus.error };
      this.updateMint(org._id, mintInfo).exec();
    }

    if (!isNil(initialMint)) {
      const mintTokenFn = this.mintToken.bind(this, org, [initialMint]);
      let txnHash = await mintTokenFn();
      txnHash = await this.apiService.confirmTxnWithRetry(txnHash, mintTokenFn);
      await this.updateMintedAmount(org._id, initialMint.amount);
      this.apiService.sendNotification(
        `${initialMint.amount / LAMPORTS_PER_SOL} ${org.username.toUpperCase().substring(0, 10)} minted to ${initialMint.wallet}:\n\n${this.apiService.buildExplorerLink('/tx/' + txnHash)}`
      );
    }
  }

  async mintToken(org: OrgDocument, receivers: [{ wallet: string, amount: number }]) {
    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    return this.apiService.mintToken(org.mint, orgPk, receivers);
  }

  async createOrganization(orgsDto: CreateOrgDto, logo: any, mock: boolean) {
    if (logo) {
      const resized = await resizeBuffer(logo.buffer);
      const fileName = `${uuid()}.jpg`;
      await this.s3Service.putFile(fileName, resized);
      orgsDto.logo = `/orgs/logo/${fileName}`;
    }

    const session = await this.connection.startSession();
    const newOrg = new this.orgRepository(pickBy(orgsDto, identity));
    let member: MemberDocument;

    await session.withTransaction(async () => {
      try {
        await newOrg.save({ session });
      } catch (error) {
        if (error.code === 11000) {
          throw new ConflictException({ error });
        }
        throw new HttpException(get(error, 'message', error.toString()), 400);
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
        const message = get(error, 'message', error.toString());
        throw new HttpException(message, code);
      }
      orgsDto.member.org = newOrg._id.toString();
      member = await this.addMemberToOrg(newOrg._id, orgsDto.member, session);
    });

    await session.endSession();

    return { org: newOrg, member };
  }

  async getOrgsByQuery(query: OrgsFilter, req: Request) {
    await this.authService.getAccountFromToken(req);

    return this.getOrgsWithFilter(query);
  }

  async getByOrgId(id: string, projection?: string, session?: ClientSession) {
    const org = await this.orgRepository
      .findById(new mongoose.Types.ObjectId(id), projection)
      .session(session);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async getOrgHistory(orgId: string) {
    const pipelines: PipelineStage[] = [
      {
        $match: { _id: new Types.ObjectId(orgId) },
      },
      { $skip: 1 },
      {
        $unionWith: {
          coll: 'members',
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$org', new Types.ObjectId(orgId)] },
                    { $ne: ['$role', Role.Investor] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user',
              },
            },
            {
              $lookup: {
                from: 'orgs',
                localField: 'orgUser',
                foreignField: '_id',
                as: 'orgUser',
              },
            },
            {
              $addFields: {
                user: { $arrayElemAt: ['$user', 0] },
                orgUser: { $arrayElemAt: ['$orgUser', 0] },
                action: OrgHistoryItemAction.Joined,
              },
            },
          ],
        },
      },
      {
        $unionWith: {
          coll: 'contributions',
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$org', new Types.ObjectId(orgId)] },
                    { $ne: ['$stoppedAt', null] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'members',
                let: { member: '$member' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$member'] } } },
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'user',
                      foreignField: '_id',
                      as: 'user',
                    },
                  },
                  {
                    $addFields: {
                      user: { $arrayElemAt: ['$user', 0] },
                    },
                  },
                ],
                as: 'member',
              },
            },
            {
              $addFields: {
                user: { $arrayElemAt: ['$member.user', 0] },
                action: OrgHistoryItemAction.Contributed,
              },
            },
          ],
        },
      },
      {
        $project: {
          'user.nickname': 1,
          'user.avatar': 1,
          'orgUser.username': 1,
          'orgUser.logo': 1,
          createdAt: 1,
          stoppedAt: 1,
          action: 1,
          date: { $ifNull: ['$stoppedAt', '$createdAt'] },
        },
      },
      { $sort: { date: -1 } },
      { $limit: 10 },
    ];
    return this.orgRepository.aggregate(pipelines);
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
  ) {
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
    await this.authService.getAccountFromToken(req);
    const query = {
      org: new Types.ObjectId(orgId),
    };
    return this.memberService.getMembers(query, 'user orgUser');
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

  async ensureMint(orgId: string) {
    await this.ensureMintNotInProgress(orgId);

    const org = await this.getByOrgId(orgId, '+password');

    if (!isNil(org.mint) && !isEmpty(org.mint)) {
      return;
    }

    try {
      let mintInfo = { mint: null, mintError: null, mintStatus: MintStatus.inProgress };
      const { file } = await this.getLogo(org.logo.split('/')[3]);
      const createTokenFn = this.apiService.createFungibleTokensForOrganization.bind(this.apiService, org, Buffer.from(file));
      const { mint, txnHash } = await createTokenFn();
      await this.apiService.confirmTxnWithRetry(txnHash, createTokenFn);
      this.apiService.sendNotification(`New ${truncate(org.username.toUpperCase(), { length: 10 })} token created:\n\n${mint}\n\n${this.apiService.buildExplorerLink('/address/' + mint)}`);
      org.mint = mint;
      mintInfo = { mint, mintError: null, mintStatus: MintStatus.success };
      await this.updateMint(org._id, mintInfo);
    } catch (err) {
      const mintInfo = { mint: null, mintError: get(err, 'message', err), mintStatus: MintStatus.error };
      this.updateMint(org._id, mintInfo);
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

  async getMemberships(orgId: string) {
    const filters = { orgUser: orgId };
    return this.memberService.getMembers(filters, 'org');
  }

  async loginAsOrg(orgId: string, account: AccountModel) {
    const org = await this.getByOrgId(orgId);
    const member = await this.membersRepository.findOne({ org: org._id, user: account.user._id });

    if (isNil(member)) {
      throw new Error('Member not found');
    }

    const payload = {
      userId: account.user._id,
      orgId: org._id,
    };
    return {
      token: this.jwtService.sign(payload),
    };
  }

}
