import { NotFoundException } from '@nestjs/common';
import { isNil } from 'lodash';
import { ClientSession, Model, Types } from 'mongoose';
import { OfferDocument } from './schema/offer.schema';

export class OffersServiceBase {
  constructor(protected offerRepository: Model<OfferDocument>,) {}

  async getOrgOfferById(orgId: string, offerId: string, session?: ClientSession) {
    const query = {
      _id: new Types.ObjectId(offerId),
      org: new Types.ObjectId(orgId),
    };
    const offer = await this.offerRepository.findOne(query).populate('org').session(session);
    if (isNil(offer)) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }
}