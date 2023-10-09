import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Deposit, DepositDocument } from './schema/deposit.schema';
import mongoose, { Model } from 'mongoose';
import { get, isNil } from 'lodash';
import { Org, OrgDocument } from '../orgs/schema/org.schema';
import { UserDocument } from '../users/schema/user.schema';
import { ApiService } from '../api-service/api.service';
import { DepositStatus } from './enum/deposit-status.enum';

@Injectable()
export class DepositService {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(Deposit.name) private depositModel: Model<DepositDocument>,
    @InjectModel(Org.name) private orgModel: Model<OrgDocument>,
    private apiService: ApiService,
  ) {}

  async handleDeposit(depositId: string, amount: number) {
    let deposit: DepositDocument;
    let account: OrgDocument | UserDocument;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        deposit = await this.depositModel
          .findById(depositId)
          .populate('user orgUser');
        if (isNil(deposit)) {
          throw new NotFoundException('Deposit not found');
        }
        deposit.amount = amount;
        account = isNil(deposit.user)
          ? (deposit.orgUser as OrgDocument)
          : (deposit.user as UserDocument);
        const rootOrg = await this.orgModel.findOne(
          { wallet: process.env.ROOT_PUBKEY },
          '+password',
        );
        const rootOrgPk = await this.apiService.getPK(
          rootOrg.wallet,
          rootOrg.password,
        );
        const txnHash = await this.apiService.mintToken(
          process.env.CREDITS_MINT,
          rootOrgPk,
          [{ wallet: account.wallet, amount: deposit.amount }],
        );
        deposit.status = DepositStatus.Fulfilled;
        deposit.txnHash = txnHash;
        await deposit.save({ session });
      });
    } catch (err) {
      if (!isNil(deposit)) {
        deposit.error = err.message;
        await deposit.save();
      }
      throw err;
    } finally {
      await session.endSession();
    }

    const nickname = get(account, 'nickname', get(account, 'username'));
    this.apiService.sendNotification(
      `User ${nickname} deposited ${
        deposit.amount
      } Credit$: ${this.apiService.buildExplorerLink(
        '/tx/' + deposit.txnHash,
      )}`,
    );
  }
}
