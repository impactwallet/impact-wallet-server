import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isNil } from 'lodash';
import mongoose, { Model } from 'mongoose';
import { OfferFiltersDto } from './dto/offer-filters.dto';
import { OfferDto } from './dto/offer.dto';
import { Offer, OfferDocument } from './schema/offer.schema';

@Injectable()
export class OffersService {
  constructor(
    @InjectModel(Offer.name) private offerRepository: Model<OfferDocument>,
  ) {}

  async createOffer(orgId: string, offer: OfferDto) {
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
    return this.offerRepository.find(query);
  }

  async getOrgOfferById(orgId: string, offerId: string) {
    const query = {
      _id: new mongoose.Types.ObjectId(offerId),
      org: new mongoose.Types.ObjectId(orgId),
    };
    const offer = await this.offerRepository.findOne(query);
    if (isNil(offer)) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }
}
