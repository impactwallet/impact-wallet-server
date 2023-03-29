import { CheckoutItemEntity, verifyWebhookSignature } from '@candypay/checkout-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isNil } from 'lodash';
import mongoose, { Model } from 'mongoose';
import { ApiService } from '../api-service/api.service';
import { CandyPayService } from '../api-service/candypay.service';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { OrgDocument } from '../orgs/schema/org.schema';
import { UserDocument } from '../users/schema/user.schema';
import { ReceivePaymentDto } from './dto/receive-payment.dto';
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
    console.log('paymentResult:', payment.cpResult);

    const org = payment.org as OrgDocument;

    if (!isNil(payment.cpResult) || body.event !== 'transaction.successful' || !org.lamportsMinted) {
      return;
    }

    const paymentAmount = body.payment_amount;
    const treasury = paymentAmount * (org.settings.treasury / 100);
    const amountToSplit = paymentAmount - treasury;
    const members = await this.memberModel.find({
      org: org._id,
      contributed: { $gt: 0 },
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
    console.log('signature:', signature);
  }

}
