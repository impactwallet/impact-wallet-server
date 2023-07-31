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
import { mapSeries } from 'bluebird';

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
        offer.investorSettings.amount <=
        offer.investorSettings.minimalInvestment
      ) {
        throw new BadRequestException({
          message: 'Amount must be not less than minimal investment',
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
            !isNil(newMember.equity) &&
            newMember.equity.type === EquityType.Immediately
          ) {
            await this.collectEquity(
              org,
              newMember,
              newMember.equity.amount,
              [],
              account,
              session,
            );
          }
          await newMember.save({ session });
        });
        await session.endSession();

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
    const equityAllocation =
      (body.amount * offer.investorSettings.equity) /
      offer.investorSettings.amount;
    let memberProspect = offer.memberProspects.find((mp) => {
      return areObjectIdsEqual(mp[memberField], account.id);
    });

    if (isNil(memberProspect)) {
      memberProspect = new this.memberProspectModel({
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
      offer.memberProspects.push(memberProspect);
    } else {
      memberProspect.investorSettings.investmentAmount += body.amount;
      memberProspect.investorSettings.equityAllocation += equityAllocation;
      memberProspect.equity.amount += equityAllocation;
    }

    switch (body.status) {
      case OfferStatusDto.accepted:
        memberProspect[memberField] = account.id.toString();
        memberProspect.org = org._id.toString();

        if (investedAmount + body.amount >= offer.investorSettings.amount) {
          offer.status = OfferStatus.Approved;
        }
        let payment: PaymentDocument;
        let equitySources = '';
        const rootOrg = await this.orgRepository.findOne(
          { wallet: process.env.ROOT_PUBKEY },
          '+password',
        );
        const balance = await this.apiService.getUSDCBalance(account.wallet);
        const paymentInfo = {
          info: `Investing $${body.amount} for ${equityAllocation}% of equity allocation`,
          amount: body.amount,
        };
        if (balance < paymentInfo.amount) {
          throw new BadRequestException({
            message: 'Insufficient funds',
          });
        }
        const commissionAmount =
          (paymentInfo.amount * LAMPORTS_PER_SOL * +process.env.COMMISSION) /
          LAMPORTS_PER_SOL;
        const session = await this.connection.startSession();
        await session.withTransaction(async () => {
          payment = await this.paymentService.receiveInvestmentInApp(
            memberProspect,
            org,
            paymentInfo,
            session,
          );
          const pk = await this.apiService.getPK(
            account.wallet,
            await account.password,
          );
          const orgPk = await this.apiService.getPK(org.wallet, org.password);
          const createUSDCAccountInstruction =
            await this.apiService.createTokenAccountInstruction(
              this.apiService.usdcMint,
              org.wallet,
            );
          const transferUSDCInstructions =
            await this.apiService.createTransferInstructions(
              this.apiService.usdcMint,
              [
                {
                  senderPk: pk,
                  wallet: org.wallet,
                  amount: payment.amount,
                },
                {
                  senderPk: orgPk,
                  wallet: rootOrg.wallet,
                  amount: commissionAmount,
                },
              ],
            );
          const createTokenAccountInstruction =
            await this.apiService.createTokenAccountInstruction(
              org.mint,
              account.wallet,
            );

          const { member, memberBeforeUpdate } =
            await this.paymentService.handleInvestmentPayment(
              org,
              payment,
              session,
            );
          if (!isNil(memberBeforeUpdate)) {
            investedMembersMap.set(
              member[memberField].toString(),
              memberBeforeUpdate.toObject(),
            );
          }
          const txnHash = await this.apiService.createAndSendTxn(
            [
              createUSDCAccountInstruction,
              ...transferUSDCInstructions,
              createTokenAccountInstruction,
            ],
            [pk, orgPk],
          );
          payment.txnHash = txnHash;
          const { memberDataMap, txnsHashes } = await this.collectEquity(
            org,
            member,
            equityAllocation,
            Array.from(investedMembersMap.values()),
            account,
            session,
          );
          payment.txnHash += `\n${txnsHashes}`;
          await payment.save({ session });
          equitySources = Object.keys(memberDataMap).reduce((acc, memberId) => {
            acc += `${memberDataMap[memberId].username}: ${memberDataMap[memberId].amount}\n`;
            return acc;
          }, '');
        });
        await session.endSession();

        const txnLinks = payment.txnHash
          .split('\n')
          .map((hash) => {
            return this.apiService.buildExplorerLink(`/tx/${hash}`);
          })
          .join('\n');
        this.apiService.sendNotification(
          `${account.username} just invested ${payment.amount} USDC into ${org.name} and received the equity from:\n\n${equitySources}\n\n${txnLinks}`,
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

    return offer.save();
  }

  async collectEquity(
    org: OrgDocument,
    newMember: MemberDocument,
    equityAllocation: number,
    skipMembers: MemberProspect[],
    account: AccountModel,
    session?: ClientSession,
  ) {
    if (
      isNil(newMember.equity) ||
      newMember.equity.type !== EquityType.Immediately
    ) {
      return;
    }
    const memberDataMap = {};
    let txnsHashes = '';
    const skipMembersIds = filter(
      flatten(skipMembers.map((mp) => [mp.user, mp.orgUser])),
      identity,
    );
    const skipAmount = skipMembers.reduce(
      (acc, mp) => acc + mp.equity.amount,
      0,
    );
    await this.memberRepository
      .find({
        _id: { $ne: new Types.ObjectId(newMember._id) },
        user: { $nin: skipMembersIds },
        orgUser: { $nin: skipMembersIds },
        org: new Types.ObjectId(org._id),
        $and: [{ equity: { $ne: null } }, { 'equity.amount': { $gt: 0 } }],
      })
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
        const memberEquityAmountL = member.equity.amount * LAMPORTS_PER_SOL;
        const equityAllocationL = equityAllocation * LAMPORTS_PER_SOL;
        const totalEquityAmountL = 100 * LAMPORTS_PER_SOL;
        const skipAmountL = skipAmount * LAMPORTS_PER_SOL;
        const amountL =
          memberEquityAmountL *
          (equityAllocationL / (totalEquityAmountL - skipAmountL));
        const amount = amountL / LAMPORTS_PER_SOL;
        const senderPk = await this.apiService.getPK(
          memberUser.wallet,
          memberUser.password,
        );
        const transferTokenInstructions =
          await this.apiService.createTransferInstructions(org.mint, [
            { senderPk, wallet: account.wallet, amount },
          ]);
        const username = defaultTo(
          (memberUser as UserDocument).nickname,
          (memberUser as OrgDocument).username,
        );
        memberDataMap[member._id.toString()] = {
          amount,
          username,
          instruction: transferTokenInstructions[0],
          senderPk,
        };
      });
    const batchSize = 5;
    const membersIds = Object.keys(memberDataMap);
    const numBatches = Math.ceil(membersIds.length / batchSize);
    for (let i = 0; i < numBatches; i++) {
      let lowerIndex = i * batchSize;
      let upperIndex = (i + 1) * batchSize;
      const membersToProcess = membersIds.slice(lowerIndex, upperIndex);
      const { instructions, pks } = membersToProcess.reduce(
        (acc, memberId) => {
          acc.instructions.push(memberDataMap[memberId].instruction);
          acc.pks.push(memberDataMap[memberId].senderPk);
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
        await mapSeries(membersToProcess, async (memberId) => {
          const { amount } = memberDataMap[memberId];
          await this.memberRepository.findOneAndUpdate(
            { _id: new Types.ObjectId(memberId) },
            {
              $inc: {
                'equity.amount': -amount,
                lamportsEarned: -(amount * LAMPORTS_PER_SOL),
              },
            },
            { session },
          );
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
    return { memberDataMap, txnsHashes };
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
        const balance = await this.apiService.getUSDCBalance(buyer.wallet);

        offer.status = OfferStatus.Approved;
        offer.buyer = buyer._id;
        const paymentInfo = {
          info: `Selling ${offer.tokensAmount} impact shares for $${offer.price}`,
          price: offer.price,
        };
        if (balance < paymentInfo.price) {
          throw new BadRequestException({
            message: 'Insufficient funds',
          });
        }
        const equityAmountAvailable = get(member, 'equity.amount', 0);
        if (equityAmountAvailable < offer.tokensAmount) {
          throw new BadRequestException({
            message: 'Not enough tokens to sell',
          });
        }
        const commimssionAmount =
          (offer.price * LAMPORTS_PER_SOL * +process.env.COMMISSION) /
          LAMPORTS_PER_SOL;
        const session = await this.connection.startSession();
        await session.withTransaction(async () => {
          // this.paymentService.profitCalculationAndSave( member, commimssionAmount, session );
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
              this.apiService.usdcMint,
              seller.wallet,
            );
          const transferUSDCInstructions =
            await this.apiService.createTransferInstructions(
              this.apiService.usdcMint,
              [
                {
                  senderPk: buyerPk,
                  wallet: seller.wallet,
                  amount: payment.amount,
                },
                {
                  senderPk: sellerPk,
                  wallet: rootOrg.wallet,
                  amount: commimssionAmount,
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
            { payment_amount: commimssionAmount },
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
