import { CheckoutItemEntity, verifyWebhookSignature } from '@candypay/checkout-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isNil } from 'lodash';
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

@Injectable()
export class PaymentService {

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
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
      const sessionData = await this.candypayService.createSession({ org: org, items });
      newPayment.cpSessionId = sessionData.session_id;
      newPayment.cpOrderId = sessionData.order_id;
      newPayment.cpPaymentUrl = sessionData.payment_url;

      await newPayment.save({ session });
    });
    await session.endSession();

    return newPayment;
  }

  async receiveInvestment(org: OrgDocument, member: MemberProspect, body: ReceiveInvestmentDto, session?: ClientSession) {
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
    const sessionData = await this.candypayService.createSession({ org: org, items });
    newPayment.cpSessionId = sessionData.session_id;
    newPayment.cpOrderId = sessionData.order_id;
    newPayment.cpPaymentUrl = sessionData.payment_url;

    await newPayment.save({ session });

    return newPayment;
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
      await this._handleInvestmentPayment(org, payment, body);
    }
  }

  async _handleInvestmentPayment(org: OrgDocument, payment: PaymentDocument, body: any) {
    console.log('investment');
    
    let newMember = new this.memberModel(payment.investor.toObject());
    newMember = await (await newMember.save()).populate('user');
    const memberUser = newMember.user as UserDocument;
    console.log(`member created ${newMember._id}`);
    
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

}
