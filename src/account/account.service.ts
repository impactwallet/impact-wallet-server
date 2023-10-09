import { Injectable } from '@nestjs/common';
import { AccountModel } from '../auth/models/account.model';
import { TxnHistoryItemDto } from '../common/dto/txn-history-item.dto';
import { ApiService } from '../api-service/api.service';
import {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
  SignaturesForAddressOptions,
} from '@solana/web3.js';
import { get, isEmpty, isEqual, isNil, toNumber } from 'lodash';
import { Org, OrgDocument } from '../orgs/schema/org.schema';
import { EntityFromTxnDto } from '../common/dto/entity-from-txn.dto';
import mongoose, { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../payment/schema/payment.schema';
import {
  SaleOffer,
  SaleOfferDocument,
  SaleOfferModel,
} from '../offers/schema/sale-offer.schema';
import { PaymentType } from '../payment/enum/payment-type.enum';
import { User, UserDocument } from '../users/schema/user.schema';
import { Account } from '@solana/spl-token';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { TransactionHistoryDto } from './dto/transaction-history.dto';
import { MemberProspectDocument } from '../offers/schema/offer.schema';
import { StripeService } from '../api-service/stripe.service';
import { DepositCreditsDto } from './dto/deposit.dto';
import { Deposit, DepositDocument } from '../deposit/schema/deposit.schema';

@Injectable()
export class AccountService {
  constructor(
    private readonly apiService: ApiService,
    private readonly stripeService: StripeService,
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(Deposit.name)
    private readonly depositModel: Model<DepositDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Org.name) private readonly orgModel: Model<OrgDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(SaleOffer.name)
    private readonly saleOfferModel: SaleOfferModel,
  ) {}

  async getUsdcHistory(
    account: AccountModel,
    options?: SignaturesForAddressOptions,
  ): Promise<TxnHistoryItemDto[]> {
    const { associatedAddress, parsedTxns } =
      await this.apiService.getUSDCHistory(account.wallet, options);
    return this._buildUsdcHistory(account, associatedAddress, parsedTxns);
  }

  async _buildUsdcHistory(
    account: AccountModel,
    associatedAddress: PublicKey,
    parsedTxns: ParsedTransactionWithMeta[],
  ): Promise<TxnHistoryItemDto[]> {
    const orgMain: OrgDocument = await this.orgModel.findOne({
      wallet: process.env.ROOT_PUBKEY,
    });
    const history: TxnHistoryItemDto[] = [];
    const rootAssociatedAddress =
      await this.apiService.getRootAssociatedAddress();
    for (const txn of parsedTxns) {
      let count = 0;
      if (!isNil(txn.meta.err)) {
        continue;
      }
      const transactionHistory = this._getTxnAmount(
        txn,
        associatedAddress,
        rootAssociatedAddress,
      );
      for (const transaction of transactionHistory) {
        const historyItem: TxnHistoryItemDto = {
          amount: transaction.amount,
          description: transaction.description,
          transactionSignature: txn.transaction.signatures[count],
        };
        count++;
        if (
          transaction.description !== 'Commission' &&
          transaction.description !== 'Sent'
        ) {
          const inAppEntity = await this._getEntityFromTxn(account, txn);
          historyItem.addressOrUsername = get(inAppEntity, 'username');
          historyItem.img = get(inAppEntity, 'img');
          if (isNil(inAppEntity)) {
            continue;
          }
          if (!isNil(inAppEntity.sale)) {
            const org = inAppEntity.sale.org as OrgDocument;
            const action =
              transaction.amount < 0 ? 'Paid for' : 'Received for selling';
            historyItem.description = `${action} ${inAppEntity.sale.tokensAmount}% of @${org.username}`;
          } else if (!isNil(inAppEntity.org)) {
            historyItem.description = 'Profit Share';
          } else if (!isNil(inAppEntity.from)) {
            historyItem.description = 'Received';
          }
        } else if (
          (transaction.description === 'Commission' &&
            transactionHistory.length > 1) ||
          transaction.description === 'Sent'
        ) {
          const regex = new RegExp(`${historyItem.transactionSignature}`, 'i');
          const payment = await this.paymentModel
            .findOne({ txnHash: regex })
            .populate(['sale.org']);
          let seller: SaleOfferDocument | MemberProspectDocument;
          let tokensAmount = 0;
          let sellerName = '';

          if (!isNil(payment) && payment.type === PaymentType.AssetsSell) {
            seller = payment.sale as SaleOfferDocument;
            tokensAmount = seller.tokensAmount;
          }
          if (!isNil(payment) && payment.type === PaymentType.Investment) {
            seller = payment.investor as MemberProspectDocument;
            tokensAmount = seller.equityAmount as number;
          }
          let soldOrganization: OrgDocument;

          if (!isNil(seller)) {
            soldOrganization = await this.orgModel.findOne({
              _id: seller.org,
            });
          }
          const inAppEntity = await this._getEntityFromTxn(account, txn);

          sellerName = !isNil(soldOrganization)
            ? soldOrganization.username
            : get(inAppEntity, 'username');

          let sellerLogo = !isNil(soldOrganization)
            ? soldOrganization.logo
            : get(inAppEntity, 'img');

          if (transaction.description === 'Commission') {
            historyItem.addressOrUsername = orgMain.name;
            historyItem.img = orgMain.logo;
            historyItem.description = `Commission for selling ${tokensAmount}% of @${sellerName}`;
          } else {
            historyItem.addressOrUsername = sellerName;
            historyItem.img = sellerLogo;
            historyItem.description = `Sent`;
            if (tokensAmount) {
              historyItem.description = `Paid for ${tokensAmount}% of @${sellerName}`;
            } else if (payment?.type === PaymentType.Investment) {
              historyItem.description = `Invested`;
            }
          }
        }
        historyItem.processedAt = txn.blockTime * 1000;
        history.push(historyItem);
      }
    }
    return history;
  }

  _getTxnAmount(
    txn: ParsedTransactionWithMeta,
    associatedAddress: PublicKey,
    rootAssociatedAddress?: PublicKey,
  ) {
    let description = 'Received';
    const historyItem: TransactionHistoryDto[] = [];
    const instructions = txn.transaction.message
      .instructions as ParsedInstruction[];
    for (const instruction of instructions) {
      const authority = get(instruction, 'parsed.info.authority', '');
      const source = get(instruction, 'parsed.info.source', '');
      const destination = get(instruction, 'parsed.info.destination', '');
      const isSent = isEqual(source.toString(), associatedAddress.toString());
      const isReceived = isEqual(
        destination.toString(),
        associatedAddress.toString(),
      );
      const isSentCommision =
        isEqual(destination.toString(), rootAssociatedAddress.toString()) &&
        isEqual(source.toString(), associatedAddress.toString());

      if (!isSent && !isReceived && !isSentCommision) {
        continue;
      }
      let amount = 0;
      amount = toNumber(
        get(
          instruction,
          'parsed.info.amount',
          get(instruction, 'parsed.info.tokenAmount.amount', 0),
        ),
      );
      if (isSentCommision) {
        amount = -amount;
        description = 'Commission';
      }
      if (!isSentCommision && isSent) {
        amount = -amount;
        description = 'Sent';
      }
      if (amount !== 0) {
        historyItem.push({ amount, description, authority });
      }
    }
    return historyItem.reverse();
  }

  async _getEntityFromTxn(
    account: AccountModel,
    txn: ParsedTransactionWithMeta,
  ): Promise<EntityFromTxnDto | null> {
    const signatures = txn.transaction.signatures;
    const regexList: RegExp[] = [];
    for (const signature of signatures) {
      const regex = new RegExp(`${signature}`, 'i');
      regexList.push(regex);
    }
    const payment = await this.paymentModel
      .findOne({
        $or: [
          { 'cpResult.signature': { $in: signatures } },
          { txnHash: { $in: signatures } },
          { txnHash: regexList },
        ],
      })
      .populate(['sale.org']);
    let sale: SaleOfferDocument;
    if (!isNil(payment) && payment.type === PaymentType.AssetsSell) {
      await this.saleOfferModel.populateSeller(payment);
      await this.saleOfferModel.populateBuyer(payment);
      sale = payment.sale;
    } else {
      sale = await this.saleOfferModel.findOne({
        txnHash: { $in: txn.transaction.signatures },
      });
      if (!isNil(sale)) {
        await sale.populateBuyer();
        await sale.populateSeller();
      }
    }
    if (!isNil(sale)) {
      const buyer = sale.buyer as UserDocument | OrgDocument;
      return {
        username: get(buyer, 'username', get(buyer, 'nickname', '')),
        img: get(buyer, 'logo', get(buyer, 'avatar', '')),
        sale,
      };
    }
    const instructions = txn.transaction.message.instructions;
    return this.parseInstruction(account, instructions);
  }
  private async parseInstruction(
    account: AccountModel,
    instructions: (ParsedInstruction | PartiallyDecodedInstruction)[],
  ) {
    return instructions.reduce<Promise<EntityFromTxnDto | null>>(
      async (entity, instruction: ParsedInstruction) => {
        if (!isNil(await entity)) {
          return entity;
        }
        const parsed = get(instruction, 'parsed');
        const authority = get(
          parsed,
          'info.authority',
          get(parsed, 'info.mintAuthority', ''),
        );
        const org = await this.orgModel.findOne({
          wallet: authority.toString(),
        });
        if (!isNil(org)) {
          return { username: org.username, img: org.logo, org };
        }
        const destination = get(parsed, 'info.destination', '');
        let accInfo: Account, owner: PublicKey;
        if (!isEmpty(destination)) {
          accInfo = await this.apiService.getAccountInfo(
            destination.toString(),
          );
          owner = get(accInfo, 'owner');
        }
        if (isEqual(authority.toString(), account.wallet.toString())) {
          const receiver = await this.userModel.findOne({
            wallet: owner.toString(),
          });
          if (!isNil(receiver)) {
            return { username: receiver.nickname, img: receiver.avatar };
          } else {
            return { username: owner.toString() };
          }
        }
        if (
          !isNil(owner) &&
          isEqual(owner.toString(), account.wallet.toString())
        ) {
          const sender = await this.userModel.findOne({
            wallet: authority.toString(),
          });
          if (!isNil(sender)) {
            return {
              username: sender.nickname,
              img: sender.avatar,
              from: sender,
            };
          } else {
            return {
              username: authority.toString(),
              from: authority.toString(),
            };
          }
        }
      },
      null,
    );
  }

  async depositCredits(account: AccountModel, body: DepositCreditsDto) {
    let paymentLink: any;
    const session = await this.connection.startSession();
    await session.withTransaction(async () => {
      const userField = account.isUser ? 'user' : 'orgUser';
      const newDeposit = new this.depositModel({
        amount: body.amount,
      });
      newDeposit[userField] = account.id.toString();
      await newDeposit.save({ session });

      const metadata = {
        depositId: newDeposit._id.toString(),
      };
      paymentLink = await this.stripeService.createPaymentLink({
        line_items: [
          {
            price: process.env.STRIPE_CREDIT_PRICE,
            quantity: body.amount,
            adjustable_quantity: { enabled: true, maximum: 999 },
          },
        ],
        metadata,
        payment_intent_data: {
          metadata,
        },
        after_completion: {
          type: 'redirect',
          redirect: {
            url: process.env.APP_URL,
          },
        },
      });
    });
    await session.endSession();
    return paymentLink;
  }
}
