import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { get } from 'lodash';
import mongoose, { Model, Types } from 'mongoose';
import { Role } from '../members/enum/roles.enum';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { Offer, OfferDocument } from './schema/offer.schema';
import { SaleOffer, SaleOfferDocument } from './schema/sale-offer.schema';

import { OfferLiteDto } from './dto/offer.lite.dto';

@Injectable()
export class OffersLiteService {
  constructor(
    @InjectModel(Offer.name) private offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectModel(SaleOffer.name) private saleOfferRepository: Model<SaleOfferDocument>
  ) { }

  async createLiteOffer(orgId: string, offer: OfferLiteDto) {
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


}
