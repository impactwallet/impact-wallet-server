import { Injectable } from '@nestjs/common';
import { AccountModel } from '../auth/models/account.model';
import { TxnHistoryItemDto } from '../common/dto/txn-history-item.dto';
import { ApiService } from '../api-service/api.service';
import { ParsedInstruction, ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';
import { get, isEmpty, isEqual, isNil, toNumber } from 'lodash';
import { Org, OrgDocument } from '../orgs/schema/org.schema';
import { EntityFromTxnDto } from '../common/dto/entity-from-txn.dto';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../payment/schema/payment.schema';
import { SaleOffer, SaleOfferDocument } from '../offers/schema/sale-offer.schema';
import { PaymentType } from '../payment/enum/payment-type.enum';
import { User, UserDocument } from '../users/schema/user.schema';
import { Account } from '@solana/spl-token';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class AccountService {
  constructor(
    private readonly apiService: ApiService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Org.name) private readonly orgModel: Model<OrgDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(SaleOffer.name) private readonly saleOfferModel: Model<SaleOfferDocument>,
  ) {}

  async getUsdcHistory(account: AccountModel): Promise<TxnHistoryItemDto[]> {
    const { associatedAddress, parsedTxns } = await this.apiService.getUSDCHistory(account.wallet);
    return this._buildUsdcHistory(account, associatedAddress, parsedTxns);
  }

  async _buildUsdcHistory(
    account: AccountModel,
    associatedAddress: PublicKey,
    parsedTxns: ParsedTransactionWithMeta[],
  ): Promise<TxnHistoryItemDto[]> {
    const history: TxnHistoryItemDto[] = [];
    for (const txn of parsedTxns) {
      if (!isNil(txn.meta.err)) {
        continue;
      }
      const { amount, description } = this._getTxnAmount(txn, associatedAddress);
      const historyItem: TxnHistoryItemDto = {
        amount,
        description,
      };
      const inAppEntity = await this._getEntityFromTxn(account, txn);
      historyItem.addressOrUsername = get(inAppEntity, 'username');
      historyItem.img = get(inAppEntity, 'img');
      if (isNil(inAppEntity)) {
        continue;
      }
      if (!isNil(inAppEntity.sale)) {
        const org = inAppEntity.sale.org as OrgDocument;
        const action = amount < 0 ? 'Paid for' : 'Received for selling';
        historyItem.description = `${action} ${inAppEntity.sale.tokensAmount} Impact Shares of @${org.username}`;
      } else if (!isNil(inAppEntity.org)) {
        historyItem.description = 'Profit Share';
      } else if (!isNil(inAppEntity.from)) {
        historyItem.description = 'Received';
      }
      historyItem.processedAt = txn.blockTime * 1000;
      history.push(historyItem);
    }
    return history;
  }

  _getTxnAmount(txn: ParsedTransactionWithMeta, associatedAddress: PublicKey) {
    let amount = 0;
    let description = 'Received';
    const instructions = txn.transaction.message.instructions as ParsedInstruction[];
    for (const instruction of instructions) {
      if (amount) break;
      const source = get(instruction, 'parsed.info.source', '');
      const destination = get(instruction, 'parsed.info.destination', '');
      const isSent = isEqual(source.toString(), associatedAddress.toString());
      const isReceived = isEqual(destination.toString(), associatedAddress.toString());
      if (!isSent && !isReceived) {
        continue;
      }
      amount = toNumber(
        get(instruction, 'parsed.info.amount', get(instruction, 'parsed.info.tokenAmount.amount', 0)),
      );
      if (isSent) {
        amount = -amount;
        description = 'Sent';
      }
    }
    return { amount, description };
  }

  async _getEntityFromTxn(account: AccountModel, txn: ParsedTransactionWithMeta)
    : Promise<EntityFromTxnDto | null> {
    const payment = await this.paymentModel.findOne({
      $or: [
        { 'cpResult.signature': { $in: txn.transaction.signatures } },
        { txnHash: { $in: txn.transaction.signatures } },
      ],
    }).populate(['sale.buyer', 'sale.org', 'sale.seller']);
    let sale: SaleOfferDocument;
    if (!isNil(payment) && payment.type === PaymentType.AssetsSell) {
      sale = payment.sale;
    } else {
      sale = await this.saleOfferModel
        .findOne({ txnHash: { $in: txn.transaction.signatures } })
        .populate(['buyer', 'seller']);
    }
    if (!isNil(sale)) {
      const buyer = sale.buyer as UserDocument;
      return {
        username: buyer.nickname,
        img: buyer.avatar,
        sale,
      };
    }
    const instructions = txn.transaction.message.instructions;
    return instructions
      .reduce<Promise<EntityFromTxnDto | null>>
    (async (entity, instruction: ParsedInstruction) => {
      if (!isNil(await entity)) {
        return entity;
      }
      const parsed = get(instruction, 'parsed');
      const authority = get(parsed, 'info.authority', get(parsed, 'info.mintAuthority', ''));
      const org = await this.orgModel.findOne({ wallet: authority.toString() });
      if (!isNil(org)) {
        return { username: org.username, img: org.logo, org };
      }
      const destination = get(parsed, 'info.destination', '');
      let accInfo: Account, owner: PublicKey;
      if (!isEmpty(destination)) {
        accInfo = await this.apiService.getAccountInfo(destination.toString());
        owner = get(accInfo, 'owner');
      }
      if (isEqual(authority.toString(), account.wallet.toString())) {
        const receiver = await this.userModel.findOne({ wallet: owner.toString() });
        if (!isNil(receiver)) {
          return { username: receiver.nickname, img: receiver.avatar };
        } else {
          return { username: owner.toString() };
        }
      }
      if (!isNil(owner) && isEqual(owner.toString(), account.wallet.toString())) {
        const sender = await this.userModel.findOne({ wallet: authority.toString() });
        if (!isNil(sender)) {
          return { username: sender.nickname, img: sender.avatar, from: sender };
        } else {
          return { username: authority.toString(), from: authority.toString() };
        }
      }
    }, null);
  }
}