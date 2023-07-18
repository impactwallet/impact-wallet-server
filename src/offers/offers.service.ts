import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { get, isNil } from 'lodash';
import mongoose, { Model, Types } from 'mongoose';
import { Role } from '../members/enum/roles.enum';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { OrgDocument } from '../orgs/schema/org.schema';
import { PaymentService } from '../payment/payment.service';
import { PaymentDocument } from '../payment/schema/payment.schema';
import { UserDocument } from '../users/schema/user.schema';
import { OfferFiltersDto } from './dto/offer-filters.dto';
import { OfferStatusBodyDto, OfferStatusDto } from './dto/offer-status.dto';
import { OfferDto } from './dto/offer.dto';
import { SaleOfferDto } from './dto/sale-offer.dto';
import { OfferStatus } from './enum/statuses.enum';
import { Offer, OfferDocument } from './schema/offer.schema';
import { SaleOffer, SaleOfferDocument } from './schema/sale-offer.schema';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ApiService } from '../api-service/api.service';
import { UsersService } from '../users/users.service';
import { OffersServiceBase } from './offers.service.base';
import { AccountModel } from '../auth/models/account.model';
import { OrgsService } from '../orgs/orgs.service';

@Injectable()
export class OffersService extends OffersServiceBase {
  constructor(
  @InjectModel(Offer.name) offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectModel(SaleOffer.name) saleOfferRepository: Model<SaleOfferDocument>,
    private readonly paymentService: PaymentService,
    private readonly apiService: ApiService,
    private readonly userService: UsersService,
    private readonly orgService: OrgsService,
  ) {
    super(offerRepository, saleOfferRepository);
  }

  async createOffer(orgId: string, offer: OfferDto) {
    if (offer.memberProspect.role === Role.Investor) {
      const existingInvestors = await this.memberRepository.find({
        org: new Types.ObjectId(orgId),
        role: Role.Investor,
      });
      const soldEquity = existingInvestors.reduce((res, member) => {
        return res + get(member, 'investorSettings.equityAllocation', 0);
      }, 0);
      if (soldEquity + offer.memberProspect.investorSettings.equityAllocation > 100) {
        throw new BadRequestException({ equityAllocation: `Only ${100 - soldEquity}% is available to offer` });
      }
    }
    offer.org = orgId;
    const newOffer = new this.offerRepository(offer);
    try {
      return await newOffer.save();
    } catch (error) {
      throw new HttpException(error, 400);
    }
  }

  getOrgOffers(orgId: string, filters: OfferFiltersDto) {
    const query = {
      org: new mongoose.Types.ObjectId(orgId),
    };
    if (!isNil(filters.status)) {
      query['status'] = filters.status;
    }
    if (!isNil(filters.role)) {
      query['memberProspect.role'] = filters.role;
    }
    return this.offerRepository.find(query);
  }

  async updateOfferStatus(org: OrgDocument, offerId: string, body: OfferStatusBodyDto, account: AccountModel) {
    let payment: PaymentDocument;
    const offer = await this.getOrgOfferById(org._id.toString(), offerId);

    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    const user = account.isUser
      ? await this.userService.getByUserId(account.id.toString(), '+password')
      : await this.orgService.getByOrgId(account.id.toString(), '+password');

    switch (body.status) {
    case OfferStatusDto.accepted:
      offer.status = OfferStatus.Approved;
      if (account.isUser) {
        offer.memberProspects[0].user = user._id.toString();
      } else {
        offer.memberProspects[0].orgUser = user._id.toString();
      }
      offer.memberProspects[0].org = org._id.toString();

      if (offer.memberProspects[0].role === Role.Investor) {
        const balance = await this.apiService.getUSDCBalance(user.wallet);
        const paymentInfo = {
          info: `Investing $${offer.memberProspects[0].investorSettings.investmentAmount} for ${offer.memberProspects[0].investorSettings.equityAllocation}% of equity allocation`,
          amount: offer.memberProspects[0].investorSettings.investmentAmount,
        };
        if (balance < paymentInfo.amount) {
          throw new BadRequestException({ message: 'Insufficient funds' });
        }
        payment = await this.paymentService.receiveInvestmentInApp(offer.memberProspects[0], org, paymentInfo);
        const senderPk = await this.apiService.getPK(user.wallet, user.password);
        const txnHash = await this.apiService.transferUSDC([{ senderPk, wallet: org.wallet, amount: payment.amount }]);

        payment.txnHash = txnHash;
        await payment.save();
        await this.paymentService.handleInvestmentPayment(org, payment, { signature: txnHash });
      } else {
        const newMember = new this.memberRepository(offer.memberProspects[0]);

        await newMember.save();
      }
      break;
    case OfferStatusDto.declined:
      offer.status = OfferStatus.Declined;
      break;
    }

    await offer.save();

    return payment;
  }

  async updateSaleOfferStatus(offerId: string, body: OfferStatusBodyDto, account: AccountModel) {
    const offer = await this.getSaleOfferById(
      offerId, [
        { path: 'org' },
        { path: 'seller', model: 'User' },
        { path: 'seller', model: 'Org' },
      ],
    );
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
        user: seller._id,
        org: org._id,
      });
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
      const senderPk = await this.apiService.getPK(buyer.wallet, buyer.password);
      const txnHash = await this.apiService.transferUSDC([{ senderPk, wallet: seller.wallet, amount: payment.amount }]);

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

  async createSaleOffer(saleOfferDto: SaleOfferDto, account: AccountModel) {
    const orgObjectId = new mongoose.Types.ObjectId(saleOfferDto.orgId);
    const member = await this.memberRepository.findOne({
      $or: [
        { user: account.id },
        { orgUser: account.id },
      ],
      org: orgObjectId,
    });
    if (isNil(member)) {
      throw new NotFoundException('Member not found');
    }
    if (member.lamportsEarned < saleOfferDto.tokensAmount * LAMPORTS_PER_SOL) {
      throw new BadRequestException('Not enough tokens to sell');
    }
    const saleOffer = new this.saleOfferRepository(saleOfferDto);
    saleOffer.seller = account.id;
    saleOffer.org = orgObjectId;
    await saleOffer.save();
    await saleOffer.populate('org');
    return saleOffer;
  }
}
