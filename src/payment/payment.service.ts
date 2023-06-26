import { mapSeries, delay } from 'bluebird';
import { CheckoutItemEntity, verifyWebhookSignature } from '@candypay/checkout-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { defaultTo, get, isNil } from 'lodash';
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
import { EquityType } from '../members/enum/equity-type.enum';

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
    const totalAmount = body.items.reduce((acc, item) => acc + item.amount, 0);
    const newPayment = new this.paymentModel({
      org: org._id,
      amount: totalAmount,
    });
    await session.withTransaction(async () => {
      const items: CheckoutItemEntity[] = body.items.map(item => ({
        name: item.name,
        price: item.amount,
        image: defaultTo(item.image, `${process.env.SERVER_URL}${org.logo}`),
        quantity: 1,
      }));
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

    try {
      if (payment.type === PaymentType.Regular) {
        this._handleRegularPayment(org, body)
          .catch(err => console.log(`Error handling regular payment for ${org.name}: ${err}`));
      } else if (payment.type === PaymentType.Investment) {
        await this.handleInvestmentPayment(org, payment, body);
      } else if (payment.type === PaymentType.AssetsSell) {
        await this.handleAssetsSale(payment);
      }
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  async handleInvestmentPayment(org: OrgDocument, payment: PaymentDocument, body: { signature: string }) {
    let member = await this.memberModel.findOne({
      org: org._id,
      user: defaultTo(payment.investor.user, payment.investor.orgUser),
    }).populate(['user', 'orgUser']);
    let memberUser = defaultTo(get(member, 'user') as UserDocument, get(member, 'orgUser') as OrgDocument);

    if (isNil(member)) {
      member = new this.memberModel(payment.investor.toObject());
      member.equity = {
        amount: payment.investor.investorSettings.equityAllocation,
        type: EquityType.Immediately,
      };
      await member.save();
      await member.populate(['user', 'orgUser']);
      memberUser = defaultTo(get(member, 'user') as UserDocument, get(member, 'orgUser') as OrgDocument);
    } else {
      member = await this.memberModel.findOneAndUpdate(
        { _id: member._id },
        {
          $inc: {
            'equity.amount': payment.investor.investorSettings.equityAllocation,
            'investorSettings.investmentAmount': payment.investor.investorSettings.investmentAmount,
            'investorSettings.equityAllocation': payment.investor.investorSettings.equityAllocation,
          },
          $set: {
            'equity.type': EquityType.Immediately,
          },
        },
        { new: true, upsert: true },
      );
    }

    const username = defaultTo((memberUser as UserDocument).nickname, (memberUser as OrgDocument).username);
    this.apiService.sendNotification(`${username} just invested ${payment.amount} into ${org.name}:\n\n${body.signature}\n\n${this.apiService.buildExplorerLink('/tx/' + body.signature)}`);

    return member;
  }

  async _handleRegularPayment(org: OrgDocument, body: any) {
    if (org.mintStatus !== 'success') {
      return;
    }
    const paymentAmount = body.payment_amount * LAMPORTS_PER_SOL;
    const treasury = paymentAmount * (org.settings.treasury / 100);
    const amountToSplit = paymentAmount - treasury;
    const holders = await this.memberModel.find({
      org: org._id,
      equity: { $ne: null },
    }).populate([
      { path: 'user' },
      { path: 'orgUser', select: '+password' },
    ]);
    const membersWithAmount = [];
    const orgMembers = [];
    
    holders.forEach((holder) => {
      const equityAmount = holder.equity?.amount * LAMPORTS_PER_SOL;
      const amount = amountToSplit * (equityAmount / org.lamportsMinted);
      const wallet = defaultTo((holder.user as UserDocument)?.wallet, (holder.orgUser as OrgDocument)?.wallet);
      membersWithAmount.push({ wallet, amount: amount / LAMPORTS_PER_SOL });
      if (isNil(holder.user) && !isNil(holder.orgUser)) {
        const orgUser = holder.orgUser as OrgDocument;
        orgMembers.push({ orgUser, amount: amount / LAMPORTS_PER_SOL });
      }
    });

    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    const signature = await this.apiService.transferUSDC(orgPk, membersWithAmount);
    await this.apiService.confirmTxnWithRetry(
      signature,
      this.apiService.transferUSDC.bind(this.apiService, orgPk, membersWithAmount),
    );
    this.apiService.sendNotification(`USDC transfered to ${org.name} and split between members:\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);

    await mapSeries(
      orgMembers,
      async ({ orgUser, amount }) => {
        try {
          await delay(2000);
          await this._handleRegularPayment(orgUser, { payment_amount: amount });
        } catch (err) {
          console.log(`Error handling regular payment for ${orgUser.name}: ${err}`);
        }
      },
    );
  }

  async handleAssetsSale(payment: PaymentDocument) {
    const member = await this.memberModel.findOne({
      $or: [
        { user: payment.sale.seller },
        { orgUser: payment.sale.seller },
      ],
      org: payment.sale.org,
    }).populate([
      { path: 'user', select: '+password' },
      { path: 'orgUser', select: '+password' },
    ]);
    const memberUser = defaultTo(member.user as UserDocument, member.orgUser as OrgDocument);
    await payment.populate([
      'sale.org',
      {
        path: 'sale',
        populate: { path: 'buyer', model: 'User' },
      },
    ]);
    if (isNil(payment.sale.buyer)) {
      await payment.populate([
        {
          path: 'sale',
          populate: { path: 'buyer', model: 'Org' },
        },
      ]);
    }
    const org = payment.sale.org as OrgDocument;
    const buyer = payment.sale.buyer as UserDocument | OrgDocument;
    const lamportsAmount = payment.sale.tokensAmount * LAMPORTS_PER_SOL;

    const transferFn = this.transfer.bind(this, memberUser, buyer, org.mint, payment.sale.tokensAmount);
    let signature = await transferFn();
    signature = await this.apiService.confirmTxnWithRetry(signature, transferFn);

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
        equity: {
          amount: payment.sale.tokensAmount,
          type: EquityType.Immediately,
        },
      });
      await newMember.save();
    } else {
      buyerMember.lamportsEarned += lamportsAmount;
      buyerMember.equity = {
        amount: get(buyerMember, 'equity.amount', 0) + payment.sale.tokensAmount,
        type: EquityType.Immediately,
      };
      await buyerMember.save();
    }

    await this.memberModel.findOneAndUpdate(
      { _id: member._id },
      {
        $inc: {
          lamportsEarned: -lamportsAmount,
          'equity.amount': -payment.sale.tokensAmount,
        },
      },
    );

    const buyerUsername = defaultTo((buyer as UserDocument).nickname, (buyer as OrgDocument).username);
    const sellerUsername = defaultTo((memberUser as UserDocument).nickname, (memberUser as OrgDocument).username);
    this.apiService.sendNotification(`${buyerUsername} just bought ${payment.sale.tokensAmount} ${org.name} impact shares from ${sellerUsername} for ${payment.amount} USDC:\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);
  }

  async transfer(source: any, destination: any, mint: string, amount: number) {
    const fromPk = await this.apiService.getPK(source.wallet, source.password);
    return this.apiService.transfer(fromPk, mint, [{ wallet: destination.wallet, amount: amount }]);
  }

}
