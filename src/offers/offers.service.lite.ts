import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { get } from 'lodash';
import mongoose, { Model, Types } from 'mongoose';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { Offer, OfferDocument } from './schema/offer.schema';
import { OfferLiteDto } from './dto/offer.lite.dto';


@Injectable()
export class OffersLiteService {
  constructor(
    @InjectModel(Offer.name) private offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>
  ) { }

  async createLiteOffer(orgId: string, offer: OfferLiteDto) {

    offer.org = orgId;
    const newOffer = new this.offerRepository(offer);
    try {
      return await newOffer.save();
    } catch (error) {
      throw new HttpException(error, 400);
    }
  }

}
