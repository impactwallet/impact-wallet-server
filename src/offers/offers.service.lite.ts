import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
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

@Injectable()
export class OffersLiteService extends OffersServiceBase {
  constructor(
  @InjectModel(Offer.name) offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    private readonly userService: UsersService,
    private readonly apiService: ApiService,
  ) {
    super(offerRepository);
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

      const newMember = new this.memberRepository(offer.memberProspect.toObject());
      if (!isNil(newMember.equity) && newMember.equity.type === EquityType.Immediately) {
        newMember.lamportsEarned = newMember.equity.amount * LAMPORTS_PER_SOL;
      }
      await newMember.save();

      if (!isNil(newMember.equity) && newMember.equity.type === EquityType.Immediately) {
        this.memberRepository.find({
          _id: { $ne: new Types.ObjectId(newMember._id) },
          org: new Types.ObjectId(org._id),
          equity: { $ne: null },
          role: { $ne: Role.Investor },
        })
          .populate({ path: 'user', select: '+password' })
          .cursor()
          .eachAsync(async (member) => {
            const memberUser = member.user as UserDocument;
            const pk = await this.apiService.getPK(memberUser.wallet, memberUser.password);
            const amount = member.equity.amount * (newMember.equity.amount / 100);
            const txnHash = await this.apiService.transfer(pk, org.mint, [{ wallet: user.wallet, amount }], 5);
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

}
