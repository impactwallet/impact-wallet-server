import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { MemberProspect, MemberProspectDocument, Offer, OfferDocument } from './schema/offer.schema';
import { OfferLiteDto } from './dto/offer.lite.dto';
import { UsersService } from '../users/users.service';
import { OrgDocument } from '../orgs/schema/org.schema';
import { OfferStatusBodyDto, OfferStatusDto } from './dto/offer-status.dto';
import { OfferStatus } from './enum/statuses.enum';
import { OffersServiceBase } from './offers.service.base';
import { cloneDeep, defaultTo, filter, first, flatten, identity, isNil } from 'lodash';
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

@Injectable()
export class OffersLiteService extends OffersServiceBase {
  constructor(
  @InjectModel(Offer.name) offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectModel(MemberProspect.name) private memberProspectModel: Model<MemberProspectDocument>,
    @InjectModel(SaleOffer.name) saleOfferRepository: Model<SaleOfferDocument>,
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
    } else {
      newOffer.memberProspects = [new this.memberProspectModel(offer.memberProspect)];
    }
    try {
      return await newOffer.save();
    } catch (error) {
      throw new BadRequestException({ message: error.message });
    }
  }

  async updateOfferStatus(org: OrgDocument, offerId: string, body: OfferStatusBodyDto, account: AccountModel) {
    const offer = await this.getOrgOfferById(org._id.toString(), offerId);

    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    if (offer.type === OfferType.Investor) {
      return this.updateInvestOfferStatus(org, offer, body, account);
    } else {
      return this.updateMemberOfferStatus(org, offer, body, account);
    }
  }

  async updateMemberOfferStatus(org: OrgDocument, offer: OfferDocument, body: OfferStatusBodyDto, account: AccountModel) {
    const memberField = account.isUser ? 'user' : 'orgUser';
    const memberProspect = first(offer.memberProspects);

    switch (body.status) {
    case OfferStatusDto.accepted:
      memberProspect[memberField] = account.id.toString();
      memberProspect.org = org._id.toString();

      offer.status = OfferStatus.Approved;
      const newMember = new this.memberRepository(memberProspect.toObject());
      if (!isNil(newMember.equity) && newMember.equity.type === EquityType.Immediately) {
        newMember.lamportsEarned = newMember.equity.amount * LAMPORTS_PER_SOL;
        this.collectEquity(org, newMember, newMember.equity.amount, [], account);
      }
      await newMember.save();

      break;
    case OfferStatusDto.declined:
      offer.status = OfferStatus.Declined;
      break;
    }

    return offer.save();
  }

  async updateInvestOfferStatus(org: OrgDocument, offer: OfferDocument, body: OfferStatusBodyDto, account: AccountModel) {
    const memberField = account.isUser ? 'user' : 'orgUser';

    const investedMembersMap = new Map<string, MemberProspectDocument>();
    offer.memberProspects.forEach((mp) => {
      investedMembersMap.set(mp[memberField].toString(), cloneDeep(mp.toObject()));
    });
    const investedAmount = Array.from(investedMembersMap.values())
      .reduce((acc, mp) => acc + mp.investorSettings.investmentAmount, 0);
    if (offer.investorSettings.amount < investedAmount + body.amount) {
      throw new BadRequestException({
        message: `Сannot invest more than: ${(offer.investorSettings.amount - investedAmount)}`,
        investedAmount,
      });
    }
    const equityAllocation =  (body.amount * offer.investorSettings.equity) / offer.investorSettings.amount;
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
      const balance = await this.apiService.getUSDCBalance(account.wallet);
      const paymentInfo = {
        info: `Investing $${body.amount} for ${equityAllocation}% of equity allocation`,
        amount: body.amount,
      };
      if (balance < paymentInfo.amount) {
        throw new BadRequestException({ message: 'Insufficient funds' });
      }
      const payment = await this.paymentService.receiveInvestmentInApp(memberProspect, org, paymentInfo);
      const pk = await this.apiService.getPK(account.wallet, (await account.password));
      const transferFn = this.apiService.transferUSDC.bind(this.apiService, [{ senderPk: pk, wallet: org.wallet, amount: payment.amount }]);
      let txnHash = await transferFn();
      txnHash = await this.apiService.confirmTxnWithRetry(txnHash, transferFn);

      payment.txnHash = txnHash;
      await payment.save();
      const { member, memberBeforeUpdate } = await this.paymentService.handleInvestmentPayment(org, payment, { signature: txnHash });
      if (!isNil(memberBeforeUpdate)) {
        investedMembersMap.set(
          member[memberField].toString(),
          memberBeforeUpdate.toObject(),
        );
      }

      this.collectEquity(org, member, equityAllocation, Array.from(investedMembersMap.values()), account);

      break;
    case OfferStatusDto.declined:
      offer.status = OfferStatus.Declined;
      break;
    }

    return offer.save();
  }

  collectEquity(
    org: OrgDocument,
    newMember: MemberDocument,
    equityAllocation: number,
    skipMembers: MemberProspect[],
    account: AccountModel,
  ) {
    if (isNil(newMember.equity) || newMember.equity.type !== EquityType.Immediately) {
      return;
    }
    const skipMembersIds = filter(flatten(skipMembers.map((mp) => [mp.user, mp.orgUser])), identity);
    const skipAmount = skipMembers.reduce((acc, mp) => acc + mp.equity.amount, 0);
    this.memberRepository.find({
      _id: { $ne: new Types.ObjectId(newMember._id) },
      user: { $nin: skipMembersIds },
      orgUser: { $nin: skipMembersIds },
      org: new Types.ObjectId(org._id),
      equity: { $ne: null },
    })
      .populate([
        { path: 'user', select: '+password' },
        { path: 'orgUser', select: '+password' },
      ])
      .cursor()
      .eachAsync(async (member) => {
        const memberUser = defaultTo(member.user as UserDocument, member.orgUser as OrgDocument);
        const memberEquityAmountL = member.equity.amount * LAMPORTS_PER_SOL;
        const equityAllocationL = equityAllocation * LAMPORTS_PER_SOL;
        const totalEquityAmountL = 100 * LAMPORTS_PER_SOL;
        const skipAmountL = skipAmount * LAMPORTS_PER_SOL;
        const amountL = memberEquityAmountL * (equityAllocationL / (totalEquityAmountL - skipAmountL));
        const amount = amountL / LAMPORTS_PER_SOL;
        const transferFn = this.transfer.bind(this, memberUser, account, org.mint, amount);
        let txnHash = await transferFn();
        txnHash = await this.apiService.confirmTxnWithRetry(txnHash, transferFn);
        await this.memberRepository.findOneAndUpdate(
          { _id: new Types.ObjectId(member._id) },
          {
            $inc: {
              'equity.amount': -amount,
              lamportsEarned: -(amount * LAMPORTS_PER_SOL),
            },
          },
        );
        const username = defaultTo((memberUser as UserDocument).nickname, (memberUser as OrgDocument).username);
        this.apiService.sendNotification(`${amount}% of equity transferred from ${username} to ${account.username}:\n\n${this.apiService.buildExplorerLink('/tx/' + txnHash)}`);
      });
  }

  async transfer(source: any, destination: any, mint: string, amount: number) {
    const senderPk = await this.apiService.getPK(source.wallet, source.password);
    return this.apiService.transfer(mint, [{ senderPk, wallet: destination.wallet, amount }]);
  }

  async updateSaleOfferStatus(offerId: string, body: OfferStatusBodyDto, account: AccountModel) {
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
      const member = await this.memberRepository.findOne({
        org: org._id,
        $or: [
          { user: seller._id },
          { orgUser: seller._id },
        ],
      }).populate([
        { path: 'user', select: '+password' },
        { path: 'orgUser', select: '+password' },
      ]);
      const balance = await this.apiService.getUSDCBalance(buyer.wallet);
      const lamportsAmount = offer.tokensAmount * LAMPORTS_PER_SOL;

      offer.status = OfferStatus.Approved;
      offer.buyer = buyer._id;
      const paymentInfo = {
        info: `Selling ${offer.tokensAmount} impact shares for $${offer.price}`,
        price: offer.price,
      };
      if (balance < paymentInfo.price) {
        throw new BadRequestException({ message: 'Insufficient funds' });
      }
      if (member.lamportsEarned < lamportsAmount) {
        throw new BadRequestException({ message: 'Not enough tokens to sell' });
      }
      payment = await this.paymentService.sellAssetsInApp(offer, paymentInfo);
      const comissionAmount = ((payment.amount * LAMPORTS_PER_SOL) * +process.env.COMISSION) / LAMPORTS_PER_SOL;
      const senderPk = await this.apiService.getPK(buyer.wallet, buyer.password);
      const sellerPk = await this.apiService.getPK(seller.wallet, seller.password);
      const txnHash = await this.apiService.transferUSDC([
        { senderPk, wallet: seller.wallet, amount: payment.amount },
        { senderPk: sellerPk, wallet: process.env.ROOT_PUBKEY, amount: comissionAmount },
      ]);

      payment.txnHash = txnHash;
      await payment.save();
      await this.paymentService.handleAssetsSale(payment);
      break;
    case OfferStatusDto.declined:
      offer.status = OfferStatus.Declined;
      break;
    }

    await offer.save();

    return payment;
  }

}
