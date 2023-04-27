import { CheckoutItemEntity, verifyWebhookSignature } from '@candypay/checkout-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { get, isNil } from 'lodash';
import mongoose, { ClientSession, Model } from 'mongoose';
import { ApiService } from '../api-service/api.service';
import { CandyPayService } from '../api-service/candypay.service';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { MemberProspect } from '../offers/schema/offer.schema';
import { OrgDocument } from '../orgs/schema/org.schema';
import { UserDocument } from '../users/schema/user.schema';
import { ReceiveInvestmentDto } from './dto/receive-investment.dto';
import { ReceivePaymentDto } from './dto/receive-payment.dto';
import { PaymentType } from './enum/payment-type.enum';
import { Payment, PaymentDocument } from './schema/payment.schema';
import { SaleOffer, SaleOfferDocument } from '../offers/schema/sale-offer.schema';
import { SellAssetsDto } from './dto/sale-assets.dto';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Role } from '../members/enum/roles.enum';

@Injectable()
export class PaymentService {

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
    @InjectModel(SaleOffer.name) private saleOfferModel: Model<SaleOfferDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private candypayService: CandyPayService,
    private apiService: ApiService,
  ) { }

  async receivePayment(org: OrgDocument, body: ReceivePaymentDto) {
    const session = await this.connection.startSession();
    const newPayment = new this.paymentModel({
      org: org._id,
      amount: body.amount,
    });
    await session.withTransaction(async () => {
      const items: CheckoutItemEntity[] = [
        {
          name: body.item,
          price: body.amount,
          image: `${process.env.SERVER_URL}${org.logo}`,
          quantity: 1,
        },
      ];
      const sessionData = await this.candypayService.createSession({ logo: org.logo, receiver: org, items });
      newPayment.cpSessionId = sessionData.session_id;
      newPayment.cpOrderId = sessionData.order_id;
      newPayment.cpPaymentUrl = sessionData.payment_url;

      await newPayment.save({ session });
    });
    await session.endSession();

    return newPayment;
  }

  async receiveInvestmentCandyPay(org: OrgDocument, member: MemberProspect, body: ReceiveInvestmentDto, session?: ClientSession) {
    const newPayment = new this.paymentModel({
      type: PaymentType.Investment,
      org: org._id,
      amount: body.amount,
      investor: member,
    });

    const items: CheckoutItemEntity[] = [
      {
        name: body.info,
        price: body.amount,
        image: `${process.env.SERVER_URL}${org.logo}`,
        quantity: 1,
      },
    ];
    const sessionData = await this.candypayService.createSession({ logo: org.logo, receiver: org, items });
    newPayment.cpSessionId = sessionData.session_id;
    newPayment.cpOrderId = sessionData.order_id;
    newPayment.cpPaymentUrl = sessionData.payment_url;

    await newPayment.save({ session });

    return newPayment;
  }

  receiveInvestmentInApp(
    member: MemberProspect,
    org: OrgDocument,
    body: ReceiveInvestmentDto,
  ) {
    const newPayment = new this.paymentModel({
      type: PaymentType.Investment,
      org: org._id,
      amount: body.amount,
      investor: member,
    });

    return newPayment.save();
  }

  async sellAssets(saleOffer: SaleOfferDocument, body: SellAssetsDto) {
    const org = saleOffer.org as OrgDocument;
    saleOffer.org = org._id;
    await saleOffer.populate('seller');
    const seller = saleOffer.seller as UserDocument;
    const newPayment = new this.paymentModel({
      type: PaymentType.AssetsSell,
      amount: body.price,
      sale: saleOffer,
    });
    const items: CheckoutItemEntity[] = [
      {
        name: body.info,
        price: body.price,
        image: `${process.env.SERVER_URL}${org.logo}`,
        quantity: 1,
      },
    ];
    const sessionData = await this.candypayService.createSession({ logo: org.logo, receiver: seller, items });
    newPayment.cpSessionId = sessionData.session_id;
    newPayment.cpOrderId = sessionData.order_id;
    newPayment.cpPaymentUrl = sessionData.payment_url;

    return newPayment.save();
  }

  sellAssetsInApp(saleOffer: SaleOfferDocument, body: SellAssetsDto) {
    const newPayment = new this.paymentModel({
      type: PaymentType.AssetsSell,
      amount: body.price,
      sale: saleOffer,
    });

    return newPayment.save();
  }

  async handlePayment(headers: any, body: any) {
    try {
      await verifyWebhookSignature({
        payload: JSON.stringify(body),
        headers,
        webhook_secret: process.env.CANDYPAY_WHSEC,
      });
    } catch (err) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const payment = await this.paymentModel.findOneAndUpdate(
      { cpOrderId: body.order_id },
      { $set: { cpResult: body } },
    ).populate({ path: 'org', select: '+password' });

    const org = payment.org as OrgDocument;

    if (!isNil(payment.cpResult) || body.event !== 'transaction.successful') {
      return;
    }

    if (payment.type === PaymentType.Regular) {
      const signature = await this._handleRegularPayment(org, body);
      console.log('signature:', signature);
    } else if (payment.type === PaymentType.Investment) {
      await this.handleInvestmentPayment(org, payment, body);
    } else if (payment.type === PaymentType.AssetsSell) {
      await this.handleAssetsSale(payment);
    }
  }

  async handleInvestmentPayment(org: OrgDocument, payment: PaymentDocument, body: { signature: string }) {
    const member = await this.memberModel.findOne({
      org: org._id,
      user: payment.investor.user,
    }).populate('user');
    let memberUser = get(member, 'user') as UserDocument;

    if (isNil(member)) {
      const newMember = new this.memberModel(payment.investor.toObject());
      await newMember.save();
      await newMember.populate('user');
      memberUser = newMember.user as UserDocument;
    } else {
      await this.memberModel.findOneAndUpdate(
        { _id: member._id },
        {
          $inc: {
            'investorSettings.investmentAmount': payment.investor.investorSettings.investmentAmount,
            'investorSettings.equityAllocation': payment.investor.investorSettings.equityAllocation,
          },
        },
      );
    }
    
    this.apiService.sendNotification(`${memberUser.nickname} just invested ${payment.amount} into ${org.name}:\n\n${body.signature}\n\n${this.apiService.buildExplorerLink('/tx/' + body.signature)}`);
  }

  async _handleRegularPayment(org: OrgDocument, body: any) {
    if (!org.lamportsMinted) {
      return;
    }
    const paymentAmount = body.payment_amount;
    const treasury = paymentAmount * (org.settings.treasury / 100);
    const amountToSplit = paymentAmount - treasury;
    const members = await this.memberModel.find({
      org: org._id,
      lamportsEarned: { $gt: 0 },
    }).populate('user');
    const membersWithAmount = members.map(member => {
      return {
        wallet: (member.user as UserDocument).wallet,
        amount: amountToSplit * (member.lamportsEarned / org.lamportsMinted),
      };
    });

    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    const signature = await this.apiService.transferUSDC(orgPk, membersWithAmount);
    this.apiService.sendNotification(`USDC transfered to ${org.name} and split between members:\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);
    return signature;
  }

  async handleAssetsSale(payment: PaymentDocument) {
    const member = await this.memberModel.findOne({
      user: payment.sale.seller,
      org: payment.sale.org,
    }).populate({ path: 'user', select: '+password' });
    const memberUser = member.user as UserDocument;
    await payment.populate(['sale.org', 'sale.buyer']);
    const org = payment.sale.org as OrgDocument;
    const buyer = payment.sale.buyer as UserDocument;
    const lamportsAmount = payment.sale.tokensAmount * LAMPORTS_PER_SOL;

    const fromPk = await this.apiService.getPK(memberUser.wallet, memberUser.password);
    const signature = await this.apiService.transfer(fromPk, org.mint, [{wallet: buyer.wallet, amount: payment.sale.tokensAmount }]);

    await this.saleOfferModel.findOneAndUpdate(
      { _id: payment.sale._id },
      { $set: { txnHash: signature } },
    );

    const buyerMember = await this.memberModel.findOne({
      user: buyer._id,
      org: org._id,
    });

    if (isNil(buyerMember)) {
      const newMember = new this.memberModel({
        role: Role.Member,
        occupation: 'Buyer',
        user: buyer._id,
        org: org._id,
        lamportsEarned: lamportsAmount,
      });
      await newMember.save();
    } else {
      buyerMember.lamportsEarned += lamportsAmount;
      await buyerMember.save();
    }

    await this.memberModel.findOneAndUpdate(
      { _id: member._id },
      { $inc: { lamportsEarned: -lamportsAmount } },
    );

    this.apiService.sendNotification(`${buyer.nickname} just bought ${payment.sale.tokensAmount} ${org.name} impact shares from ${memberUser.nickname} for ${payment.amount} USDC:\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);
  }

}
