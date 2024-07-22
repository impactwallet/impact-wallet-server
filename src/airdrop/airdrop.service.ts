import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiService } from '../api-service/api.service';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  NonceAccount,
  ParsedTransactionWithMeta,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { delay, map } from 'bluebird';
import { get, isEmpty, isNil, last } from 'lodash';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airdrop, AirdropDocument } from './schema/airdrop.schema';
import { TypeTransaction } from './enum/type-transaction.enum';
import { AirdropClaimQueryDto, AirdropDto } from './dto/airdrop.dto';
import { bigJsToNumber, toBigJs } from '../utils/bigjs';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { decode } from 'bs58';
import { UsersService } from '../users/users.service';
import { SocialsService } from '../socials/socials.service';

const TRANSFER_IX_TYPES = ['transferchecked', 'transfer'];

@Injectable()
export class AirdropService {
  constructor(
    @InjectModel(Airdrop.name)
    private airdropRepository: Model<AirdropDocument>,
    private readonly apiService: ApiService,
    private readonly userService: UsersService,
    private readonly socialsService: SocialsService,
  ) {}

  connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

  private async removeNotHolders(
    excludeWallets: string[],
    currentHolders: any[] = [],
  ) {
    const ownerWallets = currentHolders.map((holder: any) => {
      return get(holder, 'account.data.parsed.info.owner', '');
    });
    await this.airdropRepository.deleteMany({
      $or: [
        { wallet: { $nin: ownerWallets } },
        { wallet: { $in: excludeWallets } },
      ],
    });
  }

  async calculate(excludeWalletsMap: any) {
    const holdPeriodStartDate = 1720396800;
    const holdPeriodEndDate = 1721001599;

    //Get all our token holders
    let orgHolders = await this.apiService.getTokenHolders(
      process.env.DEPLAN_MINT,
    );
    orgHolders = orgHolders.filter((holder) => {
      return (
        get(holder, 'account.data.parsed.info.tokenAmount.uiAmount', 0) > 0
      );
    });
    await this.removeNotHolders(Object.keys(excludeWalletsMap), orgHolders);

    // console.log('1: Holders: ' + JSON.stringify(orgHolders[0]));
    // console.log(
    //   '------------------------------------------------------------------------------------------------------------------------------',
    // );

    //Calculate for each holder
    for (const holder of orgHolders) {
      const associatedAddress = get(holder, 'pubkey');
      // console.log('2: AssociatedAddress: ' + associatedAddress);
      // console.log(
      //   '------------------------------------------------------------------------------------------------------------------------------',
      // );

      const ownerWallet: string = get(
        holder,
        'account.data.parsed.info.owner',
        '',
      );
      // console.log('3: OwnerWallet: ' + ownerWallet);
      // console.log(
      //   '------------------------------------------------------------------------------------------------------------------------------',
      // );

      if (!excludeWalletsMap[ownerWallet]) {
        const listTransactions: AirdropDto[] = (
          await this.airdropRepository
            .find({
              wallet: ownerWallet,
            })
            .sort({ transactionDate: 1 })
        ).map((doc) => AirdropDto.fromAirdropDoc(doc));

        listTransactions.forEach((t) => {
          t.holderOfDays =
            t.holderOfDays +
            this.getDaysDifference(holdPeriodStartDate, holdPeriodEndDate);
        });

        //Parse all transactions by the holder
        let txns = await this.connection.getSignaturesForAddress(
          new PublicKey(associatedAddress),
        );
        txns = txns.filter((txn) => {
          return (
            txn.blockTime >= holdPeriodStartDate &&
            txn.blockTime <= holdPeriodEndDate
          );
        });

        if (txns.length > 20) {
          console.log(ownerWallet, 'potential bot');
          continue;
        }

        const signatures = txns.map((txn) => txn.signature);
        let parsedTxns: ParsedTransactionWithMeta[] = [];

        const parsingStart = Date.now();
        try {
          parsedTxns = await map(
            signatures,
            async (signature) => {
              await delay(2000);
              return this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
              });
            },
            { concurrency: 2 },
          );
        } catch (e) {}
        const parsingTime = Date.now() - parsingStart;
        if (parsingTime > 60 * 1000) {
          console.log(ownerWallet, parsingTime);
        }

        if (!isEmpty(parsedTxns)) {
          const firstPostTokenBalance = get(
            parsedTxns[0],
            'meta.postTokenBalances',
            [],
          ).find(
            (token) =>
              token.mint === process.env.DEPLAN_MINT &&
              token.owner === ownerWallet,
          );
          const balanceBeforeEndDate = toBigJs(
            get(firstPostTokenBalance, 'uiTokenAmount.amount'),
          );

          listTransactions.forEach((t) => {
            t.currentBalance = balanceBeforeEndDate;
          });

          //Parse each transaction by holder
          for (const transaction of parsedTxns) {
            if (!isNil(transaction.meta.err)) {
              continue;
            }
            // console.log(
            //   '4: Parsed transaction: ' + JSON.stringify(transaction),
            // );
            // console.log(
            //   '------------------------------------------------------------------------------------------------------------------------------',
            // );

            const transactionTime = get(transaction, 'blockTime');
            const postTokenBalances = get(
              transaction,
              'meta.postTokenBalances',
              [],
            );
            const postTokenBalance = postTokenBalances.find(
              (token) =>
                token.mint === process.env.DEPLAN_MINT &&
                token.owner === ownerWallet,
            );

            // console.log(
            //   '5: PostTokenBalance: ' + JSON.stringify(postTokenBalance),
            // );
            // console.log(
            //   '------------------------------------------------------------------------------------------------------------------------------',
            // );

            const preTokenBalances = get(
              transaction,
              'meta.preTokenBalances',
              [],
            );

            const preTokenBalance = preTokenBalances.find(
              (token) =>
                token.mint === process.env.DEPLAN_MINT &&
                token.owner === ownerWallet,
            );

            // console.log(
            //   '6: PreTokenBalance: ' + JSON.stringify(preTokenBalance),
            // );
            // console.log(
            //   '------------------------------------------------------------------------------------------------------------------------------',
            // );
            let transactionAmount = toBigJs(0);
            let typeOfTransaction: TypeTransaction;
            let postAmount = toBigJs(0);
            let preAmount = toBigJs(0);

            //Calculate the transaction amount and type of operation
            if (postTokenBalance !== undefined && postTokenBalance !== null) {
              if (preTokenBalance !== undefined && preTokenBalance !== null) {
                postAmount = toBigJs(
                  get(postTokenBalance, 'uiTokenAmount.amount'),
                );

                preAmount = toBigJs(
                  get(preTokenBalance, 'uiTokenAmount.amount'),
                );

                if (postAmount.gt(preAmount)) {
                  transactionAmount = postAmount.minus(preAmount);
                  typeOfTransaction = TypeTransaction.CREDIT;
                }
                if (postAmount.lt(preAmount)) {
                  transactionAmount = preAmount.minus(postAmount);
                  typeOfTransaction = TypeTransaction.DEBIT;
                }

                if (postAmount.eq(preAmount)) {
                  transactionAmount = toBigJs(0);
                  typeOfTransaction = TypeTransaction.UNKNOWN;
                }
              } else {
                transactionAmount = toBigJs(
                  get(postTokenBalance, 'uiTokenAmount.amount'),
                );
                typeOfTransaction = TypeTransaction.CREDIT;
              }
              //
              // console.log('7: Balance: ' + balanceAmount);
              // console.log(
              //   '------------------------------------------------------------------------------------------------------------------------------',
              // );

              //Save transaction to database
              const airdropDto = new AirdropDto();
              airdropDto.transactionDate = transactionTime;
              airdropDto.amount = transactionAmount;
              airdropDto.wallet = ownerWallet;
              airdropDto.typeTransaction = typeOfTransaction;
              airdropDto.holderOfDays = this.getDaysDifference(
                transactionTime,
                holdPeriodEndDate,
              );
              airdropDto.currentBalance = balanceBeforeEndDate;
              airdropDto.balanceCheck = toBigJs(0);
              airdropDto.transaction = JSON.stringify(transaction);

              listTransactions.push(airdropDto);
            }
          }
        }
        const results = this.finalCalculations(listTransactions);
        await this.airdropRepository.deleteMany({ wallet: ownerWallet });
        await this.airdropRepository.insertMany(results);
      }
    }
    console.log('Successfully received data for each holder');
  }

  private getDaysDifference(startDate: number, transactionDate: number) {
    const startDateTime = new Date(startDate * 1000);
    const endDateTime = new Date(transactionDate * 1000);

    const timeDifference = endDateTime.getTime() - startDateTime.getTime();

    return Math.floor(timeDifference / (1000 * 60 * 60 * 24));
  }

  async deplanWalletCheck(airdropWallet: string, deplanWallet: string) {
    const requiredUsagePerDayMinutes = 10;
    const claimPeriod = this.getClaimPeriod(0);
    const claimFromDate = claimPeriod.claimFromDate;
    const claimToDate = claimPeriod.claimToDate;
    const daysInPeriod = Math.ceil((claimToDate - claimFromDate) / 86400);
    const requiredUsagePerPeriodMinutes =
      daysInPeriod * requiredUsagePerDayMinutes;
    const currentDate = Math.round(Date.now() / 1000);
    const currentDayOfPeriod = Math.ceil((currentDate - claimFromDate) / 86400);
    const usageMsg = `Please use DePlan at least for ${requiredUsagePerDayMinutes} minutes per day until the end of the claim period`;
    if (currentDayOfPeriod < daysInPeriod) {
      throw new BadRequestException({ message: usageMsg });
    }
    let parsedTxns: any;
    let lastBlocktime = 0;
    let usagePerDay = {};
    do {
      const history = await this.apiService.getTokenHistory(
        deplanWallet,
        process.env.DEPLAN_MINT,
        {
          limit: 6,
          before: get(last(parsedTxns), 'transaction.signatures[0]'),
          from: claimFromDate,
        },
      );
      parsedTxns = history.parsedTxns;
      for (let i = 0; i < parsedTxns.length; i++) {
        const txn = parsedTxns[i];
        const blocktime = txn.blockTime;
        if (blocktime >= claimFromDate) {
          const ixs = get(txn, 'transaction.message.instructions', []);
          const transferIx = ixs.find((ix: any) => {
            const type = get(ix, 'parsed.type', '');
            const authority = get(ix, 'parsed.info.authority');
            if (
              TRANSFER_IX_TYPES.includes(type.toLowerCase()) &&
              authority === deplanWallet
            ) {
              return true;
            }
          });
          if (!isNil(transferIx)) {
            const memoIx = ixs.find((ix: any) => {
              return ix.programId.toString() === this.apiService.memoProgramId;
            });
            if (!isNil(memoIx)) {
              const dayOfPeriod = Math.ceil(
                (blocktime - claimFromDate) / 86400,
              );
              usagePerDay[dayOfPeriod] = {
                times: get(usagePerDay, `[${dayOfPeriod}].times`, 0) + 1,
                duration:
                  get(usagePerDay, `[${dayOfPeriod}].duration`, 0) +
                  +memoIx.parsed,
              };
            }
          }
        }
        if (i === parsedTxns.length - 1) {
          lastBlocktime = blocktime;
        }
      }
    } while (!isEmpty(parsedTxns) && lastBlocktime >= claimFromDate);
    const usageDays = Object.keys(usagePerDay);
    const totalUsageMinutes = usageDays.reduce(
      (res, key) => res + usagePerDay[key].duration,
      0,
    );
    await this.airdropRepository.findOneAndUpdate(
      {
        wallet: airdropWallet,
        typeTransaction: TypeTransaction.RESULT,
      },
      {
        $set: {
          [`stats.round${claimPeriod.round}`]: usagePerDay,
        },
      },
    );
    if (totalUsageMinutes < requiredUsagePerPeriodMinutes) {
      throw new BadRequestException({ message: usageMsg });
    }
  }

  async createClaimTransaction(wallet: string, query: AirdropClaimQueryDto) {
    await this.socialsService.twitterFollowCheck(wallet);
    await this.deplanWalletCheck(wallet, query.dePlanWallet);
    const claim = await this.getClaimByWallet(wallet, 0);

    if (claim.claimAmount === 0 || claim.isClaim) {
      return claim;
    }
    const airdropAccount = Keypair.fromSecretKey(
      decode(process.env.AIRDROP_SENDER_SK),
    );
    const senderAssociatedTokenAddress = await getAssociatedTokenAddress(
      new PublicKey(process.env.DEPLAN_MINT),
      airdropAccount.publicKey,
      false,
    );
    const receiptAssociatedTokenAddress = await getAssociatedTokenAddress(
      new PublicKey(process.env.DEPLAN_MINT),
      new PublicKey(wallet),
      false,
    );
    const airdropNonce = await this.userService.getNonce(
      airdropAccount.publicKey.toBase58(),
    );
    const airdropNonceAccount = Keypair.fromSecretKey(
      decode(airdropNonce.nonce),
    );
    const payer = new PublicKey(wallet);

    const txn = new Transaction();

    const ixs = createTransferInstruction(
      senderAssociatedTokenAddress,
      receiptAssociatedTokenAddress,
      airdropAccount.publicKey,
      claim.claimAmount,
    );

    txn.add(
      SystemProgram.nonceAdvance({
        authorizedPubkey: new PublicKey(process.env.FEE_PAYER),
        noncePubkey: airdropNonceAccount.publicKey,
      }),
    );
    txn.add(ixs);

    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000,
    });
    txn.add(priorityFeeInstruction);

    const accountInfo = await this.connection.getAccountInfo(
      airdropNonceAccount.publicKey,
    );
    const nonceAccountData = NonceAccount.fromAccountData(accountInfo.data);
    txn.recentBlockhash = nonceAccountData.nonce;
    let units = await this.apiService.getSimulationUnits(
      this.connection,
      txn.instructions,
      payer,
    );
    if (units) {
      units = Math.ceil(units * 1.05); // margin of error
      txn.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
    }
    txn.feePayer = payer;

    txn.partialSign(airdropAccount);
    await this.apiService.signByFeePayer(txn);

    const txnHash = txn
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    claim.txnHash = txnHash;

    await this.airdropRepository.findOneAndUpdate(
      {
        wallet,
        typeTransaction: TypeTransaction.RESULT,
      },
      {
        $set: { isClaim: true },
      },
    );

    return claim;
  }

  async sendClaimTransaction(wallet: string, body: any) {
    const query = {
      wallet,
      typeTransaction: TypeTransaction.RESULT,
    };
    const airdropNonce = await this.userService.getNonce(wallet);
    const airdropNonceAccount = Keypair.fromSecretKey(
      decode(airdropNonce.nonce),
    );
    try {
      await this.airdropRepository.findOneAndUpdate(query, {
        $set: { isClaim: true },
      });
      const txnHash = await this.apiService.sendEncodedTxn(
        body.txn,
        airdropNonceAccount,
      );
      await this.airdropRepository.findOneAndUpdate(query, {
        $set: { txnHash },
      });
    } catch (e) {
      const message = get(e, 'message', e);
      await this.airdropRepository.findOneAndUpdate(query, {
        $set: {
          txnError: message,
        },
      });
      throw new InternalServerErrorException({ message });
    }
  }

  getClaimPeriod(tzOffset: number) {
    const tzOffsetSeconds = tzOffset * 60;
    return {
      holdFromDate: 1711155600 + tzOffsetSeconds,
      holdToDate: 1721606399 + tzOffsetSeconds,
      claimFromDate: 1721606400 + tzOffsetSeconds,
      claimToDate: 1722211199 + tzOffsetSeconds,
      round: 8, // TODO: increment
    };
  }

  async getClaimByWallet(wallet: string, tzOffset: number) {
    const airdropResult = {
      ...this.getClaimPeriod(tzOffset),
      claimAmount: 0,
      txnHash: '',
      isClaim: false,
    };

    const holder = await this.airdropRepository.findOne({
      wallet: wallet,
      typeTransaction: TypeTransaction.RESULT,
      $or: [{ error: { $eq: null } }, { error: { $exists: false } }],
    });
    if (isNil(holder)) {
      return airdropResult;
    }
    airdropResult.claimAmount = Math.round(holder.claimAmount);
    airdropResult.isClaim = holder.isClaim;
    return airdropResult;
  }

  async airdropCalculations() {
    console.log('Start calculating percentages for each holder');

    const allHolders = await this.airdropRepository.find({
      typeTransaction: TypeTransaction.RESULT,
    });

    let totalAmount = toBigJs(0);

    for (const holder of allHolders) {
      totalAmount = totalAmount.plus(holder.finalAmount);
    }

    for (const holder of allHolders) {
      const airdropSize = toBigJs(process.env.AIRDROP_SIZE);
      const claimPercent = toBigJs(holder.finalAmount).div(totalAmount);
      const claimAmount = airdropSize.times(claimPercent);

      holder.claimPercent = bigJsToNumber(claimPercent);
      holder.claimAmount = bigJsToNumber(claimAmount);
    }

    let checkTotalPercent = toBigJs(0);
    for (const holder of allHolders) {
      checkTotalPercent = checkTotalPercent.plus(holder.claimPercent);
    }

    await this.airdropRepository.bulkSave(allHolders);

    console.log('Total amount: ' + bigJsToNumber(totalAmount));
    console.log('Total percent: ' + bigJsToNumber(checkTotalPercent));

    console.log('The calculation was completed successfully');
  }

  private finalCalculations(transactions: AirdropDto[]): AirdropDto[] {
    //Sort transactions by date ascending
    transactions.sort((a, b) => a.transactionDate - b.transactionDate);

    const resultTransactions: AirdropDto[] = [];

    let balanceCheck = toBigJs(0);
    let finalAmount = toBigJs(0);
    let transactionByWallet: string;
    let currentBalanceByWallet = toBigJs(0);
    let wallet: string;

    for (const transaction of transactions) {
      if (transaction.typeTransaction === TypeTransaction.CREDIT) {
        balanceCheck = balanceCheck.plus(transaction.amount);
      }
      if (transaction.typeTransaction === TypeTransaction.DEBIT) {
        balanceCheck = balanceCheck.minus(transaction.amount);

        for (const prevTransaction of transactions) {
          if (
            prevTransaction.typeTransaction === TypeTransaction.CREDIT &&
            prevTransaction.transactionDate < transaction.transactionDate
          ) {
            if (transaction.amount.lte(prevTransaction.amount)) {
              prevTransaction.amount = prevTransaction.amount.minus(
                transaction.amount,
              );
              transaction.amount = toBigJs(0);
              break;
            } else {
              transaction.amount = transaction.amount.minus(
                prevTransaction.amount,
              );
              prevTransaction.amount = toBigJs(0);
            }
          }
        }
      }
      transaction.balanceCheck = balanceCheck;
    }

    for (const transaction of transactions) {
      if (!transaction.amount.eq(0)) {
        const holderAmount = transaction.amount.times(transaction.holderOfDays);
        finalAmount = finalAmount.plus(holderAmount);
        transactionByWallet = transaction.transaction;
        currentBalanceByWallet = transaction.currentBalance;
        wallet = transaction.wallet;

        resultTransactions.push(transaction);
      }
    }

    if (resultTransactions.length > 0) {
      const result: AirdropDto = new AirdropDto();
      result.finalAmount = finalAmount;
      result.balanceCheck = balanceCheck;
      result.typeTransaction = TypeTransaction.RESULT;
      result.transaction = transactionByWallet;
      result.currentBalance = currentBalanceByWallet;
      result.wallet = wallet;

      if (!currentBalanceByWallet.eq(balanceCheck)) {
        result.error = 'Error in calculations';
      }

      resultTransactions.push(result);
    }
    return resultTransactions;
  }
}
