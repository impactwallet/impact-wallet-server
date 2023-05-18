import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { Offer, OfferDocument } from './schema/offer.schema';
import { OfferLiteDto } from './dto/offer.lite.dto';
import { UsersService } from '../users/users.service';
import { OrgDocument } from '../orgs/schema/org.schema';
import { OfferStatusBodyDto, OfferStatusDto } from './dto/offer-status.dto';
import { OfferStatus } from './enum/statuses.enum';
import { OffersServiceBase } from './offers.service.base';
import { isNil } from 'lodash';
import { EquityType } from '../members/enum/equity-type.enum';
import { UserDocument } from '../users/schema/user.schema';
import { ApiService } from '../api-service/api.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Role } from '../members/enum/roles.enum';
import { PaymentService } from '../payment/payment.service';
import { SaleOffer, SaleOfferDocument } from './schema/sale-offer.schema';
import { PaymentDocument } from '../payment/schema/payment.schema';

@Injectable()
export class OffersLiteService extends OffersServiceBase {
  constructor(
  @InjectModel(Offer.name) offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectModel(SaleOffer.name) saleOfferRepository: Model<SaleOfferDocument>,
    private readonly userService: UsersService,
    private readonly apiService: ApiService,
    private readonly paymentService: PaymentService,
  ) {
    super(offerRepository, saleOfferRepository);
  }

  async createLiteOffer(orgId: string, offer: OfferLiteDto) {
    offer.org = orgId;
    const newOffer = new this.offerRepository(offer);
    try {
      return await newOffer.save();
    } catch (error) {
      throw new HttpException(error, 400);
    }
  }

  async updateOfferStatus(org: OrgDocument, offerId: string, body: OfferStatusBodyDto, userId: string) {
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

      let newMember: MemberDocument;

      if (offer.memberProspect.role === Role.Investor) {
        const balance = await this.apiService.getUSDCBalance(user.wallet);
        const paymentInfo = {
          info: `Investing $${offer.memberProspect.investorSettings.investmentAmount} for ${offer.memberProspect.investorSettings.equityAllocation}% of equity allocation`,
          amount: offer.memberProspect.investorSettings.investmentAmount,
        };
        if (balance < paymentInfo.amount) {
          throw new BadRequestException({ message: 'Insufficient funds' });
        }
        const payment = await this.paymentService.receiveInvestmentInApp(offer.memberProspect, org, paymentInfo);
        const pk = await this.apiService.getPK(user.wallet, user.password);
        const txnHash = await this.apiService.transferUSDC(pk, [{ wallet: org.wallet, amount: payment.amount }]);

        payment.txnHash = txnHash;
        await payment.save();
        newMember = await this.paymentService.handleInvestmentPayment(org, payment, { signature: txnHash });
      } else {
        newMember = new this.memberRepository(offer.memberProspect.toObject());
        if (!isNil(newMember.equity) && newMember.equity.type === EquityType.Immediately) {
          newMember.lamportsEarned = newMember.equity.amount * LAMPORTS_PER_SOL;
        }
        await newMember.save();
      }

      if (!isNil(newMember.equity) && newMember.equity.type === EquityType.Immediately) {
        this.memberRepository.find({
          _id: { $ne: new Types.ObjectId(newMember._id) },
          org: new Types.ObjectId(org._id),
          equity: { $ne: null },
        })
          .populate({ path: 'user', select: '+password' })
          .cursor()
          .eachAsync(async (member) => {
            const memberUser = member.user as UserDocument;
            let amount: number;
            if (offer.memberProspect.role === Role.Investor) {
              amount = member.equity.amount * (offer.memberProspect.investorSettings.equityAllocation / 100);
            } else {
              amount = member.equity.amount * (newMember.equity.amount / 100);
            }
            const transferFn = this.transfer.bind(this, memberUser, user, org.mint, amount);
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
            this.apiService.sendNotification(`${amount}% of equity transferred from ${memberUser.nickname} to ${user.nickname}:\n\n${this.apiService.buildExplorerLink('/tx/' + txnHash)}`);
          });
      }

      break;
    case OfferStatusDto.declined:
      offer.status = OfferStatus.Declined;
      break;
    }
  
    return offer.save();
  }

  async transfer(source: any, destination: any, mint: string, amount: number) {
    const pk = await this.apiService.getPK(source.wallet, source.password);
    return this.apiService.transfer(pk, mint, [{ wallet: destination.wallet, amount }]);
  }

  async updateSaleOfferStatus(offerId: string, body: OfferStatusBodyDto, buyerId: string) {
    const offer = await this.getSaleOfferById(offerId, ['org', 'seller']);
    if (offer.status !== OfferStatus.Pending) {
      throw new ForbiddenException('Offer already accepted/declined');
    }

    const buyer = await this.userService.getByUserId(buyerId, '+password');
    const seller = offer.seller as UserDocument;
    const org = offer.org as OrgDocument;
    let payment: PaymentDocument;

    switch (body.status) {
    case OfferStatusDto.accepted:
      const member = await this.memberRepository.findOne({
        user: seller._id,
        org: org._id,
      }).populate({ path: 'user', select: '+password' });
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
      const pk = await this.apiService.getPK(buyer.wallet, buyer.password);
      const txnHash = await this.apiService.transferUSDC(pk, [{ wallet: seller.wallet, amount: payment.amount }]);

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
