import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { PaymentService } from './payment.service';
import { Payment } from './schema/payment.schema';
import { Member } from '../members/schema/member.schema';
import { SaleOffer } from '../offers/schema/sale-offer.schema';
import { Org } from '../orgs/schema/org.schema';
import { CandyPayService } from '../api-service/candypay.service';
import { ApiService } from '../api-service/api.service';
import { HttpService } from '@nestjs/axios';
import { StripeService } from '../api-service/stripe.service';
import { DepositService } from '../deposit/deposit.service';
import { DexService } from '../api-service/dex.service';
import { PaymentType } from './enum/payment-type.enum';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentModel: jest.Mock;
  let orgModel: { findOne: jest.Mock };
  let candypayService: { createSession: jest.Mock };

  const createPaymentInstance = (data: Record<string, unknown> = {}) => ({
    ...data,
    save: jest.fn().mockImplementation(function save(this: any) {
      return Promise.resolve(this);
    }),
  });

  beforeEach(async () => {
    paymentModel = jest
      .fn()
      .mockImplementation((data) => createPaymentInstance(data));
    orgModel = { findOne: jest.fn() };
    candypayService = {
      createSession: jest.fn().mockResolvedValue({
        session_id: 'sess_1',
        order_id: 'order_1',
        payment_url: 'https://pay.example.com',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Member.name), useValue: {} },
        { provide: getModelToken(SaleOffer.name), useValue: {} },
        { provide: getModelToken(Org.name), useValue: orgModel },
        { provide: 'DatabaseConnection', useValue: { startSession: jest.fn() } },
        { provide: CandyPayService, useValue: candypayService },
        { provide: ApiService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: StripeService, useValue: {} },
        { provide: DepositService, useValue: {} },
        { provide: DexService, useValue: {} },
      ],
    })
      .overrideProvider('DatabaseConnection')
      .useValue({ startSession: jest.fn() })
      .compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('receivePayment', () => {
    it('creates a payment with the summed item amounts', async () => {
      const org = { _id: new mongoose.Types.ObjectId() };
      const body = {
        items: [
          { name: 'Item A', amount: 10, image: null },
          { name: 'Item B', amount: 25, image: null },
        ],
        customData: { orderId: '123' },
      };

      const payment = await service.receivePayment(org as any, body as any);

      expect(paymentModel).toHaveBeenCalledWith({
        org: org._id,
        amount: 35,
        orgPayload: body.customData,
        items: body.items,
      });
      expect(payment.amount).toBe(35);
    });
  });

  describe('receiveInvestmentInApp', () => {
    it('persists an in-app investment payment', async () => {
      const org = { _id: new mongoose.Types.ObjectId() };
      const member = { _id: new mongoose.Types.ObjectId() };
      const body = { amount: 500, info: 'Seed round' };

      const payment = await service.receiveInvestmentInApp(
        member as any,
        org as any,
        body as any,
      );

      expect(paymentModel).toHaveBeenCalledWith({
        type: PaymentType.Investment,
        org: org._id,
        amount: 500,
        investor: member,
      });
      expect(payment.type).toBe(PaymentType.Investment);
    });
  });

  describe('sellAssetsInApp', () => {
    it('persists an in-app asset sale payment', async () => {
      const saleOffer = { _id: new mongoose.Types.ObjectId() };
      const body = { price: 200, info: '10% equity' };

      const payment = await service.sellAssetsInApp(
        saleOffer as any,
        body as any,
      );

      expect(paymentModel).toHaveBeenCalledWith({
        type: PaymentType.AssetsSell,
        amount: 200,
        sale: saleOffer,
      });
    });
  });

  describe('handleMerchantPayment', () => {
    it('throws when the organization wallet is unknown', async () => {
      orgModel.findOne.mockResolvedValue(null);

      await expect(
        service.handleMerchantPayment({
          walletAddress: 'unknown-wallet',
          amount: '10',
          memo: 'test',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
