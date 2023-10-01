import { mapSeries, delay, map } from 'bluebird';
import {
  CheckoutItemEntity,
  verifyWebhookSignature,
} from '@candypay/checkout-sdk';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { defaultTo, get, identity, isEmpty, isNil, pickBy } from 'lodash';
import mongoose, { ClientSession, Model, PopulateOptions } from 'mongoose';
import { ApiService } from '../api-service/api.service';
import { CandyPayService } from '../api-service/candypay.service';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { MemberProspect } from '../offers/schema/offer.schema';
import { Org, OrgDocument } from '../orgs/schema/org.schema';
import { UserDocument } from '../users/schema/user.schema';
import { ReceiveInvestmentDto } from './dto/receive-investment.dto';
import { ReceivePaymentDto } from './dto/receive-payment.dto';
import { PaymentType } from './enum/payment-type.enum';
import { Payment, PaymentDocument } from './schema/payment.schema';
import {
  SaleOffer,
  SaleOfferDocument,
  SaleOfferModel,
} from '../offers/schema/sale-offer.schema';
import { SellAssetsDto } from './dto/sale-assets.dto';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Role } from '../members/enum/roles.enum';
import { EquityType } from '../members/enum/equity-type.enum';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { toBigJs, toFixed } from '../utils/bigjs';
import { AccountModel } from '../auth/models/account.model';
import Bigjs from 'big.js';
import { MerchantWebhookDto } from './dto/merchant-webhook.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
    @InjectModel(SaleOffer.name) private saleOfferModel: SaleOfferModel,
    @InjectModel(Org.name) private orgModel: Model<OrgDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private candypayService: CandyPayService,
    private apiService: ApiService,
    private http: HttpService,
  ) {}

  async receivePayment(org: OrgDocument, body: ReceivePaymentDto) {
    const session = await this.connection.startSession();
    const totalAmount = body.items.reduce((acc, item) => acc + item.amount, 0);
    const newPayment = new this.paymentModel({
      org: org._id,
      amount: totalAmount,
      orgPayload: body.customData,
      items: body.items,
    });
    await session.withTransaction(async () => {
      const items: CheckoutItemEntity[] = body.items.map((item) => ({
        name: item.name,
        price: +item.amount,
        image: defaultTo(item.image, `${process.env.SERVER_URL}${org.logo}`),
        quantity: 1,
      }));
      const sessionData = await this.candypayService.createSession({
        logo: org.logo,
        receiver: org,
        items,
        successUrl: org.settings.successUrl,
        cancelUrl: org.settings.cancelUrl,
      });
      newPayment.cpSessionId = sessionData.session_id;
      newPayment.cpOrderId = sessionData.order_id;
      newPayment.cpPaymentUrl = sessionData.payment_url;

      await newPayment.save({ session });
    });
    await session.endSession();

    return newPayment;
  }

  async receiveInvestmentCandyPay(
    org: OrgDocument,
    member: MemberProspect,
    body: ReceiveInvestmentDto,
    session?: ClientSession,
  ) {
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
    const sessionData = await this.candypayService.createSession({
      logo: org.logo,
      receiver: org,
      items,
    });
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
    session?: ClientSession,
  ) {
    const newPayment = new this.paymentModel({
      type: PaymentType.Investment,
      org: org._id,
      amount: body.amount,
      investor: member,
    });

    return newPayment.save({ session });
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
    const sessionData = await this.candypayService.createSession({
      logo: org.logo,
      receiver: seller,
      items,
    });
    newPayment.cpSessionId = sessionData.session_id;
    newPayment.cpOrderId = sessionData.order_id;
    newPayment.cpPaymentUrl = sessionData.payment_url;

    return newPayment.save();
  }

  sellAssetsInApp(
    saleOffer: SaleOfferDocument,
    body: SellAssetsDto,
    session?: ClientSession,
  ) {
    const newPayment = new this.paymentModel({
      type: PaymentType.AssetsSell,
      amount: body.price,
      sale: saleOffer,
    });

    return newPayment.save({ session });
  }

  async handleMerchantPayment(body: MerchantWebhookDto) {
    const org = await this.orgModel.findOne(
      {
        wallet: body.walletAddress,
      },
      '+password',
    );
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }
    const payment = await this.receivePayment(org, {
      items: [{ name: 'Sale', amount: +body.amount, image: null }],
    });
    payment.txnHash = 'merchant';
    await payment.save();
    this.handleRegularPayment(org, { payment_amount: body.amount }).catch(
      (err) =>
        console.log(`Error handling regular payment for ${org.name}: ${err}`),
    );
  }

  async handleCandypayPayment(headers: any, body: any) {
    try {
      await verifyWebhookSignature({
        payload: JSON.stringify(body),
        headers,
        webhook_secret: process.env.CANDYPAY_WHSEC,
      });
    } catch (err) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const payment = await this.paymentModel
      .findOneAndUpdate(
        { cpOrderId: body.order_id },
        { $set: { cpResult: body } },
      )
      .populate({ path: 'org', select: '+password' });

    const org = payment.org as OrgDocument;

    if (!isNil(payment.cpResult) || body.event !== 'transaction.successful') {
      return;
    }

    console.log(`Handling payment for ${org.name}`);

    try {
      if (payment.type === PaymentType.Regular) {
        body.custom_data = payment.orgPayload;
        this.handleRegularPayment(org, body, { shouldMint: false }).catch(
          (err) =>
            console.log(
              `Error handling regular payment for ${org.name}: ${err}`,
            ),
        );
      } else if (payment.type === PaymentType.Investment) {
        await this.handleInvestmentPayment(org, payment, body);
      } else if (payment.type === PaymentType.AssetsSell) {
        await this.handleAssetsSale(payment);
      }
      console.log(`Payment for ${org.name} handled successfully`);
    } catch (err) {
      console.log('Error handling payment: ', err);
      throw err;
    }
  }

  async handleInvestmentPayment(
    org: OrgDocument,
    payment: PaymentDocument,
    session?: ClientSession,
  ) {
    const memberQuery = {
      org: org._id,
      user: payment.investor.user,
      orgUser: payment.investor.orgUser,
    };
    let member = await this.memberModel
      .findOne(pickBy(memberQuery, identity))
      .populate(['user', 'orgUser']);

    if (isNil(member)) {
      member = new this.memberModel(payment.investor.toObject());
      member.equityType = EquityType.Immediately;
    } else {
      const memberUser = defaultTo(
        member.user as UserDocument,
        member.orgUser as OrgDocument,
      );
      const equityAllocation = toBigJs(
        (await this.apiService.getTokenBalance(org.mint, memberUser.wallet))
          .uiAmount,
      );
      const newInvestmentAmount =
        get(member, 'investorSettings.investmentAmount', 0) +
        payment.investor.investorSettings.investmentAmount;
      member.investorSettings = {
        investmentAmount: newInvestmentAmount,
        equityAllocation,
      };
    }

    return member.save({ session });
  }

  async handleRegularPayment(
    org: OrgDocument,
    body: any,
    { shouldMint = true } = {},
  ) {
    if (org.mintStatus !== 'success') {
      return;
    }
    if (!isEmpty(org.settings.webhook)) {
      this.callOrgWebhook(org, body.custom_data).catch((err) => {
        console.log(`Error calling webhook for ${org.name}: ${err}`);
      });
    }
    const paymentAmount = toBigJs(body.payment_amount);
    const treasury = toFixed(paymentAmount.mul(org.settings.treasury / 100), 6);
    const amountToSplit = paymentAmount.minus(treasury);
    if (amountToSplit.lt(0)) {
      return;
    }
    const holders = await this.memberModel
      .find({
        org: org._id,
      })
      .populate([
        { path: 'user', select: '+password' },
        { path: 'orgUser', select: '+password' },
      ]);
    const membersWithAmount = [];
    const orgMembers = [];
    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    const rootOrg = await this.orgModel.findOne(
      { wallet: process.env.ROOT_PUBKEY },
      '+password',
    );
    const rootOrgPk = await this.apiService.getPK(
      rootOrg.wallet,
      rootOrg.password,
    );

    await mapSeries(holders, async (holder) => {
      const wallet = defaultTo(
        (holder.user as UserDocument)?.wallet,
        (holder.orgUser as OrgDocument)?.wallet,
      );
      const equityAmount = toBigJs(
        (await this.apiService.getTokenBalance(org.mint, wallet)).uiAmount,
      );
      if (equityAmount.eq(0)) {
        return;
      }
      const amount = toFixed(amountToSplit.mul(equityAmount.div(100)), 6);
      this.profitCalculationAndSave(holder, amount.toNumber());
      membersWithAmount.push({
        senderPk: orgPk,
        wallet,
        amount: amount.toNumber(),
      });
      if (isNil(holder.user) && !isNil(holder.orgUser)) {
        const orgUser = holder.orgUser as OrgDocument;
        orgMembers.push({
          orgUser,
          amount: amount.toNumber(),
        });
      }
    });

    const batchSize = 5;
    const numBatches = Math.ceil(membersWithAmount.length / batchSize);
    const txnHashes = [];
    for (let i = 0; i < numBatches; i++) {
      let lowerIndex = i * batchSize;
      let upperIndex = (i + 1) * batchSize;
      const membersToProcess = membersWithAmount.slice(lowerIndex, upperIndex);
      let txnFn: any;
      if (shouldMint) {
        txnFn = this.apiService.mintToken.bind(
          this.apiService,
          process.env.CREDITS_MINT,
          rootOrgPk,
          membersToProcess,
        );
      } else {
        const createUSDCAccountInstructions = await mapSeries(
          membersToProcess,
          ({ wallet }) =>
            this.apiService.createTokenAccountInstruction(
              process.env.CREDITS_MINT,
              wallet,
            ),
        );
        const transferUSDCInstructions =
          await this.apiService.createTransferInstructions(
            process.env.CREDITS_MINT,
            membersToProcess,
          );
        txnFn = this.apiService.createAndSendTxn.bind(
          this.apiService,
          [...createUSDCAccountInstructions, ...transferUSDCInstructions],
          [orgPk],
        );
      }
      try {
        let txnHash = await txnFn();
        txnHash = await this.apiService.confirmTxnWithRetry(txnHash, txnFn);
        txnHashes.push(txnHash);
      } catch (err) {
        console.log(
          `Error handling regular payment for ${JSON.stringify(
            membersToProcess,
          )}: ${err}`,
        );
      }
    }

    const txnLinks = txnHashes
      .map((hash) => {
        return this.apiService.buildExplorerLink(`/tx/${hash}`);
      })
      .join('\n');

    this.apiService.sendNotification(
      `Money transfered to ${org.name} and split between members:\n\n${txnLinks}`,
    );

    await map(
      orgMembers,
      async ({ orgUser, amount }) => {
        try {
          await delay(2000);
          await this.handleRegularPayment(
            orgUser,
            { payment_amount: amount },
            { shouldMint },
          );
        } catch (err) {
          console.log(
            `Error handling regular payment for ${orgUser.name}: ${err}`,
          );
        }
      },
      { concurrency: 3 },
    );
  }

  async handleAssetsSale(payment: PaymentDocument, session?: ClientSession) {
    const member = await this.memberModel
      .findOne({
        $or: [{ user: payment.sale.seller }, { orgUser: payment.sale.seller }],
        org: payment.sale.org,
      })
      .populate([
        { path: 'user', select: '+password' },
        { path: 'orgUser', select: '+password' },
      ]);
    const memberUser = defaultTo(
      member.user as UserDocument,
      member.orgUser as OrgDocument,
    );
    await payment.populate('sale.org');
    await this.saleOfferModel.populateBuyer(payment);
    const org = payment.sale.org as OrgDocument;
    const buyer = payment.sale.buyer as UserDocument | OrgDocument;
    const buyerMemberField =
      buyer instanceof this.orgModel ? 'orgUser' : 'user';
    const lamportsAmount = payment.sale.tokensAmount * LAMPORTS_PER_SOL;

    const senderPk = await this.apiService.getPK(
      memberUser.wallet,
      memberUser.password,
    );
    const transferInstructions =
      await this.apiService.createTransferInstructions(org.mint, [
        { senderPk, wallet: buyer.wallet, amount: payment.sale.tokensAmount },
      ]);

    const buyerMember = await this.memberModel.findOne({
      org: org._id,
      [buyerMemberField]: buyer._id,
    });

    if (isNil(buyerMember)) {
      const newMember = new this.memberModel({
        role: Role.Member,
        occupation: 'Buyer',
        [buyerMemberField]: buyer._id,
        org: org._id,
        lamportsEarned: lamportsAmount,
        equityType: EquityType.Immediately,
      });
      await newMember.save({ session });
    }

    return transferInstructions;
  }

  async profitCalculationAndSave(
    member: MemberDocument,
    profit: number,
    session?: ClientSession,
  ) {
    member.profit += profit;
    await member.save({ session });
  }

  async callOrgWebhook(org: OrgDocument, data: any) {
    const response = await firstValueFrom(
      this.http.post(org.settings.webhook, data),
    );
    return get(response, 'data');
  }

  getPaymentById(id: string, populate?: PopulateOptions | PopulateOptions[]) {
    return this.paymentModel.findById(id).populate(populate);
  }

  async performPayment(paymentId: string, account: AccountModel) {
    const payment = await this.getPaymentById(paymentId, { path: 'org' });
    const org = await this.orgModel.findById(payment.org, '+password');
    const orgPk = await this.apiService.getPK(org.wallet, org.password);
    const commissionAmount = toFixed(
      toBigJs(payment.amount).mul(+process.env.COMMISSION),
      6,
    );
    const user = account?.user as UserDocument;
    let bonusWallet = null;
    let bonusBalance = new Bigjs(0);
    const rootOrg = await this.orgModel.findOne(
      { wallet: process.env.ROOT_PUBKEY },
      '+password',
    );
    const balance = toBigJs(
      (await this.apiService.getUSDCBalance(account.wallet)).uiAmount,
    );

    if (process.env.ONBOARDING_ENABLED === 'true') {
      bonusWallet = user ? user?.bonusWallet : null;
      if (bonusWallet) {
        bonusBalance = toBigJs(
          (await this.apiService.getUSDCBalance(bonusWallet)).uiAmount,
        );
      }

      if (balance.lt(payment.amount) && bonusBalance.lt(payment.amount)) {
        throw new BadRequestException({
          message: 'Insufficient funds',
        });
      }
    }

    if (process.env.ONBOARDING_ENABLED !== 'true') {
      if (balance.lt(payment.amount)) {
        throw new BadRequestException({
          message: 'Insufficient funds',
        });
      }
    }

    let senderWallet = account.wallet;
    if (process.env.ONBOARDING_ENABLED === 'true') {
      senderWallet = bonusBalance.gte(payment.amount)
        ? bonusWallet
        : account.wallet;
    }

    const senderPk = await this.apiService.getPK(
      senderWallet,
      await account.password,
    );

    const createUSDCAccountInstructions =
      await this.apiService.createTokenAccountInstruction(
        process.env.CREDITS_MINT,
        org.wallet,
      );
    const transferUSDCInstructions =
      await this.apiService.createTransferInstructions(
        process.env.CREDITS_MINT,
        [
          { senderPk, wallet: org.wallet, amount: payment.amount },
          {
            senderPk: orgPk,
            wallet: rootOrg.wallet,
            amount: commissionAmount.toNumber(),
          },
        ],
      );
    const txnHash = await this.apiService.createAndSendTxn(
      [createUSDCAccountInstructions, ...transferUSDCInstructions],
      [senderPk, orgPk],
    );
    payment.txnHash = txnHash;

    this.handleRegularPayment(
      org,
      {
        payment_amount: toFixed(
          toBigJs(payment.amount).minus(commissionAmount),
          6,
        ).toNumber(),
        custom_data: payment.orgPayload,
      },
      { shouldMint: false },
    ).catch((err) => {
      console.log(
        `Error handling regular payment for ${org.name} during performPayment: ${err}`,
      );
    });

    this.handleRegularPayment(
      rootOrg,
      {
        payment_amount: commissionAmount.toNumber(),
      },
      { shouldMint: false },
    ).catch((err) => {
      console.log(
        `Error handling comission from regular payment for ${org.name} during performPayment: ${err}`,
      );
    });

    return payment.save();
  }
}
