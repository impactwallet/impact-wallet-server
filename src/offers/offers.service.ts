import { ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isNil } from 'lodash';
import mongoose, { ClientSession, Model } from 'mongoose';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { OfferFiltersDto } from './dto/offer-filters.dto';
import { OfferStatusBodyDto, OfferStatusDto } from './dto/offer-status.dto';
import { OfferDto } from './dto/offer.dto';
import { OfferStatus } from './enum/statuses.enum';
import { Offer, OfferDocument } from './schema/offer.schema';

@Injectable()
export class OffersService {
  constructor(
    @InjectModel(Offer.name) private offerRepository: Model<OfferDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
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

  async getOrgOfferById(orgId: string, offerId: string, session?: ClientSession) {
    const query = {
      _id: new mongoose.Types.ObjectId(offerId),
      org: new mongoose.Types.ObjectId(orgId),
    };
    const offer = await this.offerRepository.findOne(query).session(session);
    if (isNil(offer)) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }

  async updateOfferStatus(orgId: string, offerId: string, body: OfferStatusBodyDto) {

    const session = await this.connection.startSession();
    await session.withTransaction(async () => {
      const offer = await this.getOrgOfferById(orgId, offerId, session);

      if (offer.status !== OfferStatus.Pending) {
        throw new ForbiddenException('Offer already accepted/declined');
      }
  
      switch (body.status) {
      case OfferStatusDto.accepted:
        offer.status = OfferStatus.Approved;

        const newMember = new this.memberRepository(offer.memberProspect.toObject());
        newMember.org = orgId;
        await newMember.save({ session });
        break;
      case OfferStatusDto.declined:
        offer.status = OfferStatus.Declined;
        break;
      }
  
      await offer.save({ session });
    });
    await session.endSession();
  }
}
