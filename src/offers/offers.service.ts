import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { get, isNil } from 'lodash';
import mongoose, { ClientSession, Model, Types } from 'mongoose';
import { Role } from '../members/enum/roles.enum';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { OrgDocument } from '../orgs/schema/org.schema';
import { PaymentService } from '../payment/payment.service';
import { Payment, PaymentDocument } from '../payment/schema/payment.schema';
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

@Injectable()
export class OffersService {
  constructor(
    @InjectModel(Offer.name) private offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectModel(SaleOffer.name) private saleOfferRepository: Model<SaleOfferDocument>,
    private readonly paymentService: PaymentService,
    private readonly apiService: ApiService,
    private readonly userService: UsersService,
  ) {}

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

  async getOrgOfferById(orgId: string, offerId: string, session?: ClientSession) {
    const query = {
      _id: new mongoose.Types.ObjectId(offerId),
      org: new mongoose.Types.ObjectId(orgId),
    };
    const offer = await this.offerRepository.findOne(query).populate('org').session(session);
    if (isNil(offer)) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }

  async updateOfferStatus(org: OrgDocument, offerId: string, body: OfferStatusBodyDto, userId: string) {
    let payment: PaymentDocument;
    const offer = await this.getOrgOfferById(org._id.toString(), offerId);

    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    const user = await this.userService.getByUserId(userId, '+password');
  
    switch (body.status) {
    case OfferStatusDto.accepted:
      offer.status = OfferStatus.Approved;
      offer.memberProspect.user = user._id.toString();
      offer.memberProspect.org = org._id.toString();

      if (offer.memberProspect.role === Role.Investor) {
        const balance = await this.apiService.getUSDCBalance(user.wallet);
        const paymentInfo = {
          info: `Investing $${offer.memberProspect.investorSettings.investmentAmount} for ${offer.memberProspect.investorSettings.equityAllocation}% of equity allocation`,
          amount: offer.memberProspect.investorSettings.investmentAmount,
        };
        if (balance < paymentInfo.amount) {
          throw new BadRequestException({ message: 'Insufficient funds' });
        }
        payment = await this.paymentService.receiveInvestmentInApp(offer.memberProspect, org, paymentInfo);
        const pk = await this.apiService.getPK(user.wallet, user.password);
        const txnHash = await this.apiService.transferUSDC(pk, [{ wallet: org.wallet, amount: payment.amount }]);

        payment.txnHash = txnHash;
        await payment.save();
        await this.paymentService.handleInvestmentPayment(org, payment, { signature: txnHash });
      } else {
        const newMember = new this.memberRepository(offer.memberProspect.toObject());

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

  async updateSaleOfferStatus(offerId: string, body: OfferStatusBodyDto, buyer: UserDocument) {
    const offer = await this.getSaleOfferById(offerId, 'org');
    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    let payment: Payment;

    switch (body.status) {
    case OfferStatusDto.accepted:
      offer.status = OfferStatus.Approved;
      offer.buyer = buyer._id;
      const paymentInfo = {
        info: `Selling ${offer.tokensAmount} impact shares for $${offer.price}`,
        price: offer.price,
      };
      payment = await this.paymentService.sellAssets(offer, paymentInfo);
      break;
    case OfferStatusDto.declined:
      offer.status = OfferStatus.Declined;
      break;
    }

    await offer.save();

    return payment;
  }

  async createSaleOffer(saleOfferDto: SaleOfferDto) {
    const orgObjectId = new mongoose.Types.ObjectId(saleOfferDto.orgId);
    const userObjectId = new mongoose.Types.ObjectId(saleOfferDto.userId);
    const member = await this.memberRepository.findOne({
      user: userObjectId,
      org: orgObjectId,
    });
    if (isNil(member)) {
      throw new NotFoundException('Member not found');
    }
    if (member.lamportsEarned < saleOfferDto.tokensAmount * LAMPORTS_PER_SOL) {
      throw new BadRequestException('Not enough tokens to sell');
    }
    const saleOffer = new this.saleOfferRepository(saleOfferDto);
    saleOffer.seller = userObjectId;
    saleOffer.org = orgObjectId;
    await saleOffer.save();
    await saleOffer.populate('org');
    return saleOffer;
  }

  async getSaleOfferById(offerId: string, populate?: any) {
    const offer = await this.saleOfferRepository.findById(offerId).populate(populate);
    if (isNil(offer)) {
      throw new NotFoundException('Sale offer not found');
    }
    return offer;
  }
}
