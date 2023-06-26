import { NotFoundException } from '@nestjs/common';
import { find, isNil } from 'lodash';
import { ClientSession, Model, Types } from 'mongoose';
import { OfferDocument } from './schema/offer.schema';
import { SaleOfferDocument } from './schema/sale-offer.schema';

export class OffersServiceBase {
  constructor(
    protected offerRepository: Model<OfferDocument>,
    protected saleOfferRepository: Model<SaleOfferDocument>,
  ) {}

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

  async getSaleOfferById(offerId: string, populate?: any) {
    const offer = await this.saleOfferRepository.findById(offerId).populate(populate);
    if (!isNil(populate) && (
      populate === 'seller' ||
      populate.includes('seller') ||
      !isNil(find(populate, ['path', 'seller']))
    )) {
      await offer.populate({ path: 'seller', model: 'User' });
      if (isNil(offer.seller)) {
        await offer.populate({ path: 'seller', model: 'Org' });
      }
    }
    if (isNil(offer)) {
      throw new NotFoundException('Sale offer not found');
    }
    return offer;
  }
}