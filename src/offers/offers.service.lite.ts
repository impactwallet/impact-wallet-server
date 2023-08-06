import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Member, MemberDocument } from '../members/schema/member.schema';
import {
  MemberProspect,
  MemberProspectDocument,
  Offer,
  OfferDocument,
} from './schema/offer.schema';
import { OfferLiteDto } from './dto/offer.lite.dto';
import { UsersService } from '../users/users.service';
import { Org, OrgDocument } from '../orgs/schema/org.schema';
import { OfferStatusBodyDto, OfferStatusDto } from './dto/offer-status.dto';
import { OfferStatus } from './enum/statuses.enum';
import { OffersServiceBase } from './offers.service.base';
import {
  cloneDeep,
  defaultTo,
  filter,
  first,
  flatten,
  get,
  identity,
  isNil,
  pickBy,
} from 'lodash';
import { EquityType } from '../members/enum/equity-type.enum';
import { UserDocument } from '../users/schema/user.schema';
import { ApiService } from '../api-service/api.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Role } from '../members/enum/roles.enum';
import { PaymentService } from '../payment/payment.service';
import { SaleOffer, SaleOfferDocument } from './schema/sale-offer.schema';
import { PaymentDocument } from '../payment/schema/payment.schema';
import { AccountModel } from '../auth/models/account.model';
import { OrgsService } from '../orgs/orgs.service';
import { OfferType } from './enum/offer-type.enum';
import { areObjectIdsEqual } from '../utils/mongo';
import { map, reduce } from 'bluebird';
import Bigjs from 'big.js';
import { toBigJs, toFixed } from '../utils/bigjs';

@Injectable()
export class OffersLiteService extends OffersServiceBase {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Offer.name) offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name)
    private memberRepository: Model<MemberDocument>,
    @InjectModel(MemberProspect.name)
    private memberProspectModel: Model<MemberProspectDocument>,
    @InjectModel(SaleOffer.name)
    saleOfferRepository: Model<SaleOfferDocument>,
    @InjectModel(Org.name) private orgRepository: Model<OrgDocument>,
    private readonly userService: UsersService,
    private readonly apiService: ApiService,
    private readonly paymentService: PaymentService,
    private readonly orgService: OrgsService,
  ) {
    super(offerRepository, saleOfferRepository);
  }

  async createLiteOffer(orgId: string, offer: OfferLiteDto) {
    offer.org = orgId;
    const newOffer = new this.offerRepository(offer);

    if (offer.type === OfferType.Investor) {
      newOffer.memberProspects = [];
      if (
        offer.investorSettings.amount < offer.investorSettings.minimalInvestment
      ) {
        throw new BadRequestException({
          message: 'Amount must be greater than minimal investment',
        });
      }
    } else {
      newOffer.memberProspects = [
        new this.memberProspectModel(offer.memberProspect),
      ];
    }
    try {
      return await newOffer.save();
    } catch (error) {
      throw new BadRequestException({ message: error.message });
    }
  }

  async updateOfferStatus(
    orgId: string,
    offerId: string,
    body: OfferStatusBodyDto,
    account: AccountModel,
  ) {
    const org = await this.orgService.getByOrgId(orgId, '+password');
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    const offer = await this.getOrgOfferById(org._id.toString(), offerId);

    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    if (offer.type === OfferType.Investor) {
      if (
        offer.investorSettings.amount < offer.investorSettings.minimalInvestment
      ) {
        throw new BadRequestException({
          message: 'Amount must be not less than minimal investment',
        });
      }

      const balance = toBigJs(
        (await this.apiService.getUSDCBalance(account.wallet)).uiAmount,
      );
      if (balance.lt(body.amount)) {
        throw new BadRequestException({
          message: 'Insufficient funds',
        });
      }

      this.updateInvestOfferStatus(org, offer, body, account).catch((error) =>
        console.error(`Error while updating invest offer status: ${error}`),
      );
    } else {
      this.updateMemberOfferStatus(org, offer, body, account).catch((error) =>
        console.error(`Error while updating member offer status: ${error}`),
      );
    }
  }

  async updateMemberOfferStatus(
    org: OrgDocument,
    offer: OfferDocument,
    body: OfferStatusBodyDto,
    account: AccountModel,
  ) {
    const memberField = account.isUser ? 'user' : 'orgUser';
    const memberProspect = first(offer.memberProspects);

    switch (body.status) {
      case OfferStatusDto.accepted:
        memberProspect[memberField] = account.id.toString();
        memberProspect.org = org._id.toString();

        offer.status = OfferStatus.Approved;
        let txnHashes = '';
        let memberDataMap = {};
        const newMember = new this.memberRepository(memberProspect.toObject());
        const session = await this.connection.startSession();
        await session.withTransaction(async () => {
          const createTokenAccountInstruction =
            await this.apiService.createTokenAccountInstruction(
              org.mint,
              account.wallet,
            );
          await this.apiService.createAndSendTxn(
            [createTokenAccountInstruction],
            [],
          );
          if (
            newMember.equityAmount !== 0 &&
            newMember.equityType === EquityType.Immediately
          ) {
            memberDataMap = await this.calculateEquity(
              org,
              newMember,
              new Bigjs(newMember.equityAmount),
              [],
            );
            txnHashes = await this.collectEquity(org, memberDataMap, account);
          }
          await newMember.save({ session });
        });
        await session.endSession();

        this.sendMemberOfferNotification(
          org,
          memberDataMap,
          txnHashes,
          account,
        ).catch((error) =>
          console.error(
            `Error while sending member offer notification: ${error}`,
          ),
        );

        break;
      case OfferStatusDto.declined:
        offer.status = OfferStatus.Declined;
        break;
    }

    return offer.save();
  }

  async updateInvestOfferStatus(
    org: OrgDocument,
    offer: OfferDocument,
    body: OfferStatusBodyDto,
    account: AccountModel,
  ) {
    const memberField = account.isUser ? 'user' : 'orgUser';

    const investedMembersMap = new Map<string, MemberProspectDocument>();
    offer.memberProspects.forEach((mp) => {
      investedMembersMap.set(
        mp[memberField].toString(),
        cloneDeep(mp.toObject()),
      );
    });
    const investedAmount = Array.from(investedMembersMap.values()).reduce(
      (acc, mp) => acc + mp.investorSettings.investmentAmount,
      0,
    );
    if (offer.investorSettings.amount < investedAmount + body.amount) {
      throw new BadRequestException({
        message: `Сannot invest more than: ${
          offer.investorSettings.amount - investedAmount
        }`,
        investedAmount,
      });
    }
    const equityAllocation = toFixed(
      new Bigjs(body.amount)
        .mul(offer.investorSettings.equity)
        .div(offer.investorSettings.amount),
      9,
    );
    const memberProspect = new this.memberProspectModel({
      occupation: 'Investor',
      role: Role.Investor,
      equity: {
        amount: equityAllocation,
        type: EquityType.Immediately,
      },
      investorSettings: {
        investmentAmount: body.amount,
        equityAllocation,
      },
      org: org._id,
      [memberField]: account.id,
    });

    switch (body.status) {
      case OfferStatusDto.accepted:
        memberProspect[memberField] = account.id.toString();
        memberProspect.org = org._id.toString();

        if (investedAmount + body.amount >= offer.investorSettings.amount) {
          offer.status = OfferStatus.Approved;
        }
        const rootOrg = await this.orgRepository.findOne(
          { wallet: process.env.ROOT_PUBKEY },
          '+password',
        );
        const paymentInfo = {
          info: `Investing $${body.amount} for ${equityAllocation}% of equity allocation`,
          amount: body.amount,
        };
        const payment = await this.paymentService.receiveInvestmentInApp(
          memberProspect,
          org,
          paymentInfo,
        );
        const memberQuery = {
          org: org._id,
          user: payment.investor.user,
          orgUser: payment.investor.orgUser,
        };
        const member = await this.memberRepository.findOne(
          pickBy(memberQuery, identity),
        );
        if (!isNil(member)) {
          investedMembersMap.set(
            get(member[memberField], '_id', '').toString(),
            member.toObject(),
          );
        }
        const memberDataMap = await this.calculateEquity(
          org,
          member,
          equityAllocation,
          Array.from(investedMembersMap.values()),
        );
        const { txnHash, commissionAmount } =
          await this.transferUSDCFromInvestor(org, payment, account);
        payment.txnHash = txnHash;
        const txnsHashes = await this.collectEquity(
          org,
          memberDataMap,
          account,
        );
        payment.txnHash += `\n${txnsHashes}`;

        const existingMemberProspect = offer.memberProspects.find((mp) => {
          return areObjectIdsEqual(mp[memberField], account.id);
        });
        if (isNil(existingMemberProspect)) {
          offer.memberProspects.push(memberProspect);
        } else {
          existingMemberProspect.investorSettings.investmentAmount +=
            body.amount;
          existingMemberProspect.investorSettings.equityAllocation = new Bigjs(
            existingMemberProspect.investorSettings.equityAllocation,
          ).add(equityAllocation);
          existingMemberProspect.equityAmount = new Bigjs(
            existingMemberProspect.equityAmount,
          ).add(equityAllocation);
        }

        const session = await this.connection.startSession();
        await session.withTransaction(async () => {
          await this.paymentService.handleInvestmentPayment(
            org,
            payment,
            session,
          );
          await payment.save({ session });
          await offer.save({ session });
        });
        await session.endSession();

        this.sendInvestmentNotification(
          org,
          memberDataMap,
          payment,
          account,
        ).catch((error) =>
          console.error(
            `Error while sending investment notification: ${error}`,
          ),
        );

        // Handle commission
        this.paymentService
          .handleRegularPayment(
            rootOrg,
            { payment_amount: commissionAmount },
            false,
          )
          .catch((error) =>
            console.error(`Error while handling commission payment: ${error}`),
          );
        break;
      case OfferStatusDto.declined:
        offer.status = OfferStatus.Declined;
        await offer.save();
        break;
    }

    return offer;
  }

  sendInvestmentNotification(
    org: OrgDocument,
    memberDataMap: any,
    payment: PaymentDocument,
    account: AccountModel,
  ) {
    const equitySources = Object.keys(memberDataMap).reduce((acc, memberId) => {
      const { username, amount, error } = memberDataMap[memberId];
      acc += `${username}: ${defaultTo(error, amount.toNumber())}\n`;
      return acc;
    }, '');
    const txnLinks = payment.txnHash
      .split('\n')
      .map((hash) => {
        return this.apiService.buildExplorerLink(`/tx/${hash}`);
      })
      .join('\n');
    return this.apiService.sendNotification(
      `${account.username} just invested ${payment.amount} USDC into ${org.name} and received the equity from:\n\n${equitySources}\n\n${txnLinks}`,
    );
  }

  sendMemberOfferNotification(
    org: OrgDocument,
    memberDataMap: any,
    txnHashes: string,
    account: AccountModel,
  ) {
    const equitySources = Object.keys(memberDataMap).reduce((acc, memberId) => {
      const { username, amount, error } = memberDataMap[memberId];
      acc += `${username}: ${defaultTo(error, amount.toNumber())}\n`;
      return acc;
    }, '');
    const txnLinks = txnHashes
      .split('\n')
      .map((hash) => {
        return this.apiService.buildExplorerLink(`/tx/${hash}`);
      })
      .join('\n');

    return this.apiService.sendNotification(
      `${account.username} just accepted offer to join ${org.name} and received the equity from:\n\n${equitySources}\n\n${txnLinks}`,
    );
  }

  async calculateEquity(
    org: OrgDocument,
    member: MemberDocument,
    equityAllocation: Bigjs,
    skipMembers: MemberProspect[],
  ) {
    const memberDataMap = {};
    const skipMembersIds = filter(
      flatten(skipMembers.map((mp) => [mp.user, mp.orgUser])),
      identity,
    );
    const skipAmount = skipMembers.reduce(
      (acc, mp) => acc.add(mp.equityAmount),
      new Bigjs(0),
    );
    const queryParams = {
      user: { $nin: skipMembersIds },
      orgUser: { $nin: skipMembersIds },
      org: new Types.ObjectId(org._id),
    };
    if (!isNil(member)) {
      queryParams['_id'] = { $ne: new Types.ObjectId(member._id) };
    }
    await this.memberRepository
      .find(queryParams)
      .populate([
        { path: 'user', select: '+password' },
        { path: 'orgUser', select: '+password' },
      ])
      .cursor()
      .eachAsync(async (member) => {
        const memberUser = defaultTo(
          member.user as UserDocument,
          member.orgUser as OrgDocument,
        );
        const memberEquity = toBigJs(
          (await this.apiService.getTokenBalance(org.mint, memberUser.wallet))
            .uiAmount,
        );
        if (memberEquity.eq(0)) {
          return;
        }
        const amount = toFixed(
          memberEquity.mul(
            equityAllocation.div(new Bigjs(100).minus(skipAmount)),
          ),
          9,
        );
        const username = defaultTo(
          (memberUser as UserDocument).nickname,
          (memberUser as OrgDocument).username,
        );
        memberDataMap[member._id.toString()] = {
          amount,
          username,
          wallet: memberUser.wallet,
          password: memberUser.password,
        };
      });
    return memberDataMap;
  }

  async collectEquity(
    org: OrgDocument,
    memberDataMap: any,
    account: AccountModel,
  ) {
    let txnsHashes = '';
    const batchSize = 5;
    const membersIds = Object.keys(memberDataMap);
    const numBatches = Math.ceil(membersIds.length / batchSize);
    for (let i = 0; i < numBatches; i++) {
      let lowerIndex = i * batchSize;
      let upperIndex = (i + 1) * batchSize;
      const membersToProcess = membersIds.slice(lowerIndex, upperIndex);
      const { instructions, pks } = await reduce(
        membersToProcess,
        async (acc, memberId) => {
          const { amount, wallet, password } = memberDataMap[memberId];
          const senderPk = await this.apiService.getPK(wallet, password);
          const transferTokenInstructions =
            await this.apiService.createTransferInstructions(org.mint, [
              {
                senderPk,
                wallet: account.wallet,
                amount: (amount as Bigjs).toNumber(),
              },
            ]);
          acc.instructions.push(transferTokenInstructions[0]);
          acc.pks.push(senderPk);
          return acc;
        },
        { instructions: [], pks: [] },
      );
      const transferFn = this.apiService.createAndSendTxn.bind(
        this.apiService,
        instructions,
        pks,
      );
      try {
        let txnHash = await transferFn();
        txnHash = await this.apiService.confirmTxnWithRetry(
          txnHash,
          transferFn,
        );
        txnsHashes += `${txnHash}\n`;
        membersToProcess.forEach((memberId) => {
          memberDataMap[memberId].processed = true;
        });
      } catch (error) {
        console.error(`Error while collecting equity: ${error}`);
        membersToProcess.forEach((memberId) => {
          memberDataMap[memberId].processed = true;
          memberDataMap[memberId].error = error;
        });
      }
    }
    return txnsHashes;
  }

  async transferUSDCFromInvestor(
    org: OrgDocument,
    payment: PaymentDocument,
    account: AccountModel,
  ) {
    const rootOrg = await this.orgRepository.findOne(
      { wallet: process.env.ROOT_PUBKEY },
      '+password',
    );
    const commissionAmount =
      (payment.amount * LAMPORTS_PER_SOL * +process.env.COMMISSION) /
      LAMPORTS_PER_SOL;
    const accountPk = await this.apiService.getPK(
      account.wallet,
      await account.password,
    );
    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    const createUSDCAccountInstruction =
      await this.apiService.createTokenAccountInstruction(
        process.env.USDC_MINT,
        org.wallet,
      );
    const transferUSDCInstructions =
      await this.apiService.createTransferInstructions(process.env.USDC_MINT, [
        {
          senderPk: accountPk,
          wallet: org.wallet,
          amount: payment.amount,
        },
        {
          senderPk: orgPk,
          wallet: rootOrg.wallet,
          amount: commissionAmount,
        },
      ]);
    const createTokenAccountInstruction =
      await this.apiService.createTokenAccountInstruction(
        org.mint,
        account.wallet,
      );
    const txnHash = await this.apiService.createAndSendTxn(
      [
        createUSDCAccountInstruction,
        ...transferUSDCInstructions,
        createTokenAccountInstruction,
      ],
      [accountPk, orgPk],
    );
    return { commissionAmount, txnHash };
  }

  async transfer(source: any, destination: any, mint: string, amount: number) {
    const senderPk = await this.apiService.getPK(
      source.wallet,
      source.password,
    );
    return this.apiService.transfer(mint, [
      { senderPk, wallet: destination.wallet, amount },
    ]);
  }

  async updateSaleOfferStatus(
    offerId: string,
    body: OfferStatusBodyDto,
    account: AccountModel,
  ) {
    const offer = await this.getSaleOfferById(offerId, ['org']);
    await offer.populateSeller('+password');
    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    const buyer = account.isUser
      ? await this.userService.getByUserId(account.id.toString(), '+password')
      : await this.orgService.getByOrgId(account.id.toString(), '+password');
    const seller = offer.seller as UserDocument | OrgDocument;
    const org = offer.org as OrgDocument;
    let payment: PaymentDocument;

    switch (body.status) {
      case OfferStatusDto.accepted:
        const rootOrg = await this.orgRepository.findOne(
          { wallet: process.env.ROOT_PUBKEY },
          '+password',
        );
        const member = await this.memberRepository
          .findOne({
            org: org._id,
            $or: [{ user: seller._id }, { orgUser: seller._id }],
          })
          .populate([
            { path: 'user', select: '+password' },
            { path: 'orgUser', select: '+password' },
          ]);
        const balance = toBigJs(
          (await this.apiService.getUSDCBalance(buyer.wallet)).uiAmount,
        );

        offer.status = OfferStatus.Approved;
        offer.buyer = buyer._id;
        const paymentInfo = {
          info: `Selling ${offer.tokensAmount} impact shares for $${offer.price}`,
          price: offer.price,
        };
        if (balance.lt(paymentInfo.price)) {
          throw new BadRequestException({
            message: 'Insufficient funds',
          });
        }
        const commissionAmount = new Bigjs(offer.price).mul(
          +process.env.COMMISSION,
        );
        const session = await this.connection.startSession();
        await session.withTransaction(async () => {
          payment = await this.paymentService.sellAssetsInApp(
            offer,
            paymentInfo,
            session,
          );
          const buyerPk = await this.apiService.getPK(
            buyer.wallet,
            buyer.password,
          );
          const sellerPk = await this.apiService.getPK(
            seller.wallet,
            seller.password,
          );
          const createUSDCAccountInstruction =
            await this.apiService.createTokenAccountInstruction(
              process.env.USDC_MINT,
              seller.wallet,
            );
          const transferUSDCInstructions =
            await this.apiService.createTransferInstructions(
              process.env.USDC_MINT,
              [
                {
                  senderPk: buyerPk,
                  wallet: seller.wallet,
                  amount: payment.amount,
                },
                {
                  senderPk: sellerPk,
                  wallet: rootOrg.wallet,
                  amount: commissionAmount.toNumber(),
                },
              ],
            );
          const createTokenAccountInstruction =
            await this.apiService.createTokenAccountInstruction(
              org.mint,
              buyer.wallet,
            );
          const transferTokenInstructions =
            await this.paymentService.handleAssetsSale(payment, session);
          const txnHash = await this.apiService.createAndSendTxn(
            [
              createUSDCAccountInstruction,
              ...transferUSDCInstructions,
              createTokenAccountInstruction,
              ...transferTokenInstructions,
            ],
            [buyerPk, sellerPk],
          );
          payment.txnHash = offer.txnHash = txnHash;
          await payment.save({ session });
        });
        await session.endSession();

        const buyerUsername = defaultTo(
          (buyer as UserDocument).nickname,
          (buyer as OrgDocument).username,
        );
        const sellerUsername = defaultTo(
          (seller as UserDocument).nickname,
          (seller as OrgDocument).username,
        );
        this.apiService.sendNotification(
          `${buyerUsername} just bought ${payment.sale.tokensAmount} ${org.name} impact shares from ${sellerUsername} for ${payment.amount} USDC:\n\n${payment.txnHash}`,
        );

        // Our commission
        this.paymentService
          .handleRegularPayment(
            rootOrg,
            { payment_amount: commissionAmount },
            false,
          )
          .catch((error) =>
            console.error(`Error while handling commission payment: ${error}`),
          );
        break;
      case OfferStatusDto.declined:
        offer.status = OfferStatus.Declined;
        break;
    }

    await offer.save();

    return payment;
  }
}
