import { NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { OffersServiceBase } from './offers.service.base';

class TestOffersService extends OffersServiceBase {}

describe('OffersServiceBase', () => {
  let service: TestOffersService;
  let offerRepository: { findOne: jest.Mock };
  let saleOfferRepository: { findById: jest.Mock };

  beforeEach(() => {
    offerRepository = { findOne: jest.fn() };
    saleOfferRepository = { findById: jest.fn() };
    service = new TestOffersService(
      offerRepository as any,
      saleOfferRepository as any,
    );
  });

  describe('getOrgOfferById', () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const offerId = new mongoose.Types.ObjectId().toString();

    it('returns the offer when it belongs to the org', async () => {
      const offer = { _id: offerId, org: orgId };
      offerRepository.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(offer),
        }),
      });

      await expect(service.getOrgOfferById(orgId, offerId)).resolves.toBe(offer);
    });

    it('throws when the offer is not found', async () => {
      offerRepository.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.getOrgOfferById(orgId, offerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getSaleOfferById', () => {
    const offerId = new mongoose.Types.ObjectId().toString();

    it('returns the sale offer when found', async () => {
      const offer = { _id: offerId, tokensAmount: 10 };
      saleOfferRepository.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(offer),
      });

      await expect(service.getSaleOfferById(offerId)).resolves.toBe(offer);
    });

    it('throws when the sale offer is missing', async () => {
      saleOfferRepository.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getSaleOfferById(offerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
