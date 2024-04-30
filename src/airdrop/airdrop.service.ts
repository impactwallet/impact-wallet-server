import { Injectable } from '@nestjs/common';
import { ApiService } from '../api-service/api.service';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { delay, map } from 'bluebird';
import { get, isEmpty, isNil } from 'lodash';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airdrop, AirdropDocument } from './schema/airdrop.schema';
import { TypeTransaction } from './enum/type-transaction.enum';
import { AirdropDto } from './dto/airdrop.dto';
import { bigJsToNumber, toBigJs } from '../utils/bigjs';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import base58 from 'bs58';

@Injectable()
export class AirdropService {
  constructor(
    @InjectModel(Airdrop.name)
    private airdropRepository: Model<AirdropDocument>,
    private readonly apiService: ApiService,
  ) {}

  connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

  async calculate() {
    // Last Date of the promotion (1.05.2024)
    const lastDateOfThePromotion = 1714521600;

    //Get all our token holders
    const orgHolders = await this.apiService.getTokenHolders(
      process.env.DEPLAN_TOKEN,
    );

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

      const ownerWallet = get(holder, 'account.data.parsed.info.owner');
      const errors = await this.airdropRepository.find({
        wallet: ownerWallet,
        error: { $ne: null },
      });
      const finalResult = await this.airdropRepository.findOne({
        wallet: ownerWallet,
        typeTransaction: TypeTransaction.RESULT,
      });
      if (isEmpty(errors) && !isNil(finalResult)) {
        continue;
      }
      await this.airdropRepository.deleteMany({
        wallet: ownerWallet,
      });
      // console.log('3: OwnerWallet: ' + ownerWallet);
      // console.log(
      //   '------------------------------------------------------------------------------------------------------------------------------',
      // );

      const balance = toBigJs(
        get(holder, 'account.data.parsed.info.tokenAmount.amount'),
      );

      if (!this.excludeWallets.includes(ownerWallet) && balance.gt(0)) {
        //Parse all transactions by the holder
        const txns = await this.connection.getSignaturesForAddress(
          new PublicKey(associatedAddress),
        );

        const signatures = txns.map((txn) => txn.signature);
        let parsedTxns = [];

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

        if (isEmpty(parsedTxns)) {
          continue;
        }

        const listTransactions: AirdropDto[] = [];

        //Parse each transaction by holder
        for (const transaction of parsedTxns) {
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
              token.mint === process.env.DEPLAN_TOKEN &&
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
              token.mint === process.env.DEPLAN_TOKEN &&
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

              preAmount = toBigJs(get(preTokenBalance, 'uiTokenAmount.amount'));

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
            airdropDto.holderOfDays = await this.getDaysDifference(
              transactionTime,
              lastDateOfThePromotion,
            );
            airdropDto.currentBalance = balance;
            airdropDto.balanceCheck = toBigJs(0);
            airdropDto.transaction = JSON.stringify(transaction);

            listTransactions.push(airdropDto);
          }
        }
        const results = await this.finalCalculations(listTransactions);
        await this.airdropRepository.insertMany(results);
      }
    }
    console.log('Successfully received data for each holder');
  }

  private async getDaysDifference(
    startDate: number,
    transactionDate: number,
  ): Promise<number> {
    const startDateTime = new Date(startDate * 1000);
    const endDateTime = new Date(transactionDate * 1000);

    const timeDifference = endDateTime.getTime() - startDateTime.getTime();

    return Math.floor(timeDifference / (1000 * 60 * 60 * 24));
  }

  async createClaimTransaction(wallet: string) {
    const claim = await this.getClaimByWallet(wallet);

    if (claim.claimAmount !== 0) {
      const senderPublicKey = process.env.AIRDROP_SENDER_PUBLIC_KEY;
      const airdropWalletSecretKey = process.env.AIRDROP_WALLET_SECRET_KEY;
      const senderAssociatedTokenAddress = await getAssociatedTokenAddress(
        new PublicKey(process.env.DEPLAN_TOKEN),
        new PublicKey(senderPublicKey),
        false,
      );
      const receiverAssociatedTokenAddress = await getAssociatedTokenAddress(
        new PublicKey(process.env.DEPLAN_TOKEN),
        new PublicKey(wallet),
        false,
      );

      const txn = new Transaction();

      const ixs = createTransferInstruction(
        senderAssociatedTokenAddress,
        new PublicKey(wallet),
        receiverAssociatedTokenAddress,
        claim.claimAmount,
      );

      txn.add(ixs);

      const blockhash = await this.connection.getLatestBlockhash('finalized');
      txn.recentBlockhash = blockhash.blockhash;

      txn.partialSign(
        Keypair.fromSecretKey(base58.decode(airdropWalletSecretKey)),
      );

      const txnHash = txn
        .serialize({ requireAllSignatures: false })
        .toString('base64');

      claim.txnHash = txnHash;

      await this.airdropRepository.findOneAndUpdate(
        {
          wallet: wallet,
          typeTransaction: TypeTransaction.RESULT,
          $or: [{ error: { $eq: null } }, { error: { $exists: false } }],
        },
        {
          txnHash: txnHash,
          isClaim: true,
        },
      );
    }

    return claim;
  }

  async getClaimByWallet(wallet: string) {
    const airdropResult = {
      holdFromDate: 1711152000,
      holdToDate: 1714521599,
      claimFromDate: 1714521600,
      claimToDate: 1717804800,
      claimAmount: 0,
      txnHash: '',
    };

    const holder = await this.airdropRepository.findOne({
      wallet: wallet,
      typeTransaction: TypeTransaction.RESULT,
      $or: [{ error: { $eq: null } }, { error: { $exists: false } }],
    });
    if (holder.isClaim === false) {
      airdropResult.claimAmount = holder.claimAmount;
    }
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

  private async finalCalculations(
    transactions: AirdropDto[],
  ): Promise<AirdropDto[]> {
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
    return resultTransactions;
  }

  excludeWallets = [
    'HhDDQJq5nEZzNhcpabceuXZZEzwRWiAa61gSm6RJi1yP',
    'gYGWGVttJyMSdj4ELTG3734a3vR6ZfyUCZsgdfoqRXP',
    '2gZ7RvwRRAqt9MnHATPR2m8shBWrzTQJ5P74nragSnzB',
    'yArDRFrFzEiTQeqW7QNVM987mwiqfQY9UpxwM2WMhP1',
    '7WnrBfoyfvdRWXYorew4VMRneCHCe8JBux5SpsStN9rq',
    'AT3Atfb6nHP8DyzZDhHTur27YYpXHDSLU1wKf6BUtUzR',
    '7QaHhBSYHTF6CC5ZnMFnxNWQsjpZuavyynLiZLGt5S5X',
    '27DPcugo19oEyWMPo2GNNcireycxZgQBXobSnqNGyT6S',
    'HEpYU6dhHdbot6xzcp8vhZ4c7DtCgmJKkwKnbDQ49J6w',
    '6ucgQKeNKAfMCDR6PRHSM7JF14nSXcNjMzbaXsZ1tYuu',
    '3B3KEFpuCou5qyUoeLz5p9kKPFi7fhBV9FzC4ZCvZqBF',
    'GfDCmmMC8bo4VRiVSmxMVjYfv7aVzCSDQi767MRx4SGx',
    'CF53zzeGh92YbuGGei2rCjdWpVghFm9pQ3e68dBy7JiF',
    '9xG45acAYpNBqcNCSBuQzXce6yhHFpmfrE16E7kCvXdS',
    '9SVsEmCCcHS6coe1QerdCTDrmixjnvysZkuLG4FvsaNY',
    'B745tzmN9j8H4DcArJvvwvyA1tnJCywaHBAvMCR5eF2H',
    '2WaptzbUQ42zV4ffQciYp6n3b5jKyTc1Y9w2z8wTmExC',
    '15eXgqzYisibZn32AyMPwiqvYVC2sNXjAWQLTsqVjzh',
    'FFwdL5tEbbimh4Hb6yCFobJoxb8aFKZCQYHkGFp154Qk',
    '9wKZaV11X2TP4mx3Fud4v68mDkH8s3fEpfuTVf4NVk5z',
    'G5oDiBytoyEbHs7rZLLVACSruX7XM1pkLjYA3bbtJthz',
    '9W5fgfuJZDyPp6YZoxo6TK2JHg5aiMsunWbXqYSBtYEf',
    '3vcgbJQwH9cWw3KtUKZpQ9Es24RrHRgLCUMAHxh1bZ4x',
    '7w8aaXd2CHjizmmiKp9WJkp8LtUB66XYKh3oRhy8aFic',
    '8QBRGtrUtCTpjr1fMy6LkncKF3FkYB34UzGiSx3jZ4XD',
    'EuTERkVVX5VXLekiBAyCPATbugYRbyZQCPTEWrX7htLT',
    'D2HyQdsgLSQzim6dVcdAZT5mkNAzoMkvyuUFhw1VGNTV',
    '2VGKnEhqNd5dELywNEEq88QP2isPUMnTf2YP1TyTz64Z',
    'E2ZRCBKUKKSSmr5z1iG7Tx5gbDqn5yXUF2HBUAASu8xM',
    '26bU7eAzoXWNEXJyxakUCcuiAe27sZt2traXv5bLz5u5',
    '216jEUoLpJY5i69DzsVoLBejRFgbYdtcmQCvomrDtJLW',
    'FFcP9htH4DVTTHW52Ztrrt4Jpxkg44PiVjyy8m2sgvVi',
    'AhQVnWewx1JzFsxG61RCsPn74nuiCGRZRcud37xhhQse',
    'Bgm79FL3gCpCRn2HRTQJhPxYNf8zwNSDBeRJgACGrhuj',
    'AC18dkd7bNfjYm2PCQq6YsG334EU5THXad5Di8HdhEpu',
    '98JN6xT2J6xVzghpdxpGtNt4dRqGsEtgPXfXbbQEQxa',
    'CF9uTSX14QUWRKWqr29oaZVsUnc7ksNcRrYRYc47iHuc',
    '4Gz2rCjxSEWDW2NYvTLeMa9JgdSBxRSyjABvk4Fr3CKT',
    'Bu5koc1TBLNFmmE9EyDTz4jibZ2o5dA5YPkZfHgQyqaH',
    '6L8qUbAwsWbLdDdzryx5WkhJgypKXivBAbGbSeynsvm4',
    '8T2mk1oLokNbF8Rk5tRHNf8656ToeA8cBYich7it76YB',
    'EpDUCJxb1bHWtXWq8hrdXiExLKXRbWTwmm7a6rH8Uu25',
    '8xFkcJMsqeeZjJyuy3ME2r6VxwMir8aumic6MhA35VT7',
    'FhCtqxMbtVpSeJX2N3aHQENw31gTvzUDH4RBMrR5ek1E',
    'F1QVYcP2wx2EmRwqgddboDLFedPHrqtV7eZ2WUjctnQP',
    'FGEtqEe8aVgommDKcWxWJFYYm6efYzgKrb8tqxL3ZMCG',
    '5kPYRv7N9G94Ju6NSM5BhNouK2cXfxJTTe4yDsyVcV3A',
    '2rdiNy8DKQgC4cFDoHHqoAa3ckpVn3Nsb9e8FsjnoBxd',
    'CSD1bMjjJ1WpchkQrPTWQSfgpPJWTYTEFbaNRGrg6Sg7',
    '6vTNT5GJD9Gvdhy8zDXoLndLphEHKyFJNeE4knceE5RM',
    '4v7gSPkvAA5zVygntxvAH9VJfCyTzDj4D3ugrPKB2uas',
    'FrxxbUB5jJKvX5dSGVRHvFMpCm1g2WNK4BE6z2umUWEA',
    '63V42S2qpisfBzAQbDoqu8dYJrCk97fyhhGTtWheDqS6',
    '5zzWJfAD1Dn4JFCbUMydvLK8Vwu2FgjivtbG9HVo3ZZ9',
    '2p3oBtfM2d98GvE7zdk2Ng5E6dQErc2t93TTZnQu8Lqp',
    '6D71REFrfDKy96Ubqgyw49T38SxjihnfYgfgTAmbxWej',
    'AioQ1BvXvVwqkTf2gPgw5hZNUyYp8ThPAzxTQGWX91wG',
    'FSR1eN5UYDgQM6KGaMRpue4ERRJYGJoTKjcMbn5mzhPH',
    'EdfTtcpN5FxwYeRQtzTQPEsXzjFubh779mjbcwx4wJit',
    '86AWbSEsaBTmTkXJZgEdjFqSpYHBSe2NpS3WNPExBNCK',
    '36qPKhJYCiFbaGsCwRmBzBsz6ZL1nz1x8ThzUzP85Bre',
    '8yQBfPotssuV8pEPaJDHViK47bidLMcPjDU2LUCPzXKJ',
    'AKq2mFo5ic55wkVssb6jYKjPsQsxv93ug9dE7aUPn6mB',
    '3J8domw19nWhg7WKdWiCavuR64nMXkEyLLnwK3WJvQhV',
    'FXhabFy8zZwbGZx6DLbFLsWQmpLkEQPPasXtsVNdhicC',
    '9LKKiZ3PQg53Qaa6etD8a3VnUb7sFpD44yh6quwd8rSW',
    '5hJXddk1y8Qkwgc6wWVHx7hVdrLeNtsisnWvqJmUkeUm',
    '3x7Y7mHEAZERbjhwuSAywsL366sTwN1scVzyZdoZyJbH',
    'HzxUqqkpMYKX6M5AF3XZ762Q6Q4o8J5BGskLLLDHDJnN',
    '9ynGP4AGMyANaPnAJSoKz9fXwi5EpPSBM2j1R4x39Dfg',
    'DZ1NwQFkMyf2YLQsAApFXcHfTK2k3mSz6xroDAcsDF7',
    '8KUoLjgNuVnuwVMuBrNZyavYn84FhfV7wiQmeZpaPjKc',
    '66JcSNMoY3NuADWTQPuN2PcKAiJ4YDACe3fUKDquTUXf',
    '5dmS15jWeUi993y4vc5brdbA2nzHM4j59dNpgqormtFY',
    '3RY4X3Z9oXsJo34SJXuRCAUMEBPhKCD3w1ko8KaNbFot',
    'H1p4ATDt2HCPT86f2MBaQUPtmDuByvXBRv3yT6YENtBs',
    '9M77CP9LGTQ8zaQanxUGzzbzTbLKvGrGLa12DKqNVqby',
    'AczMn5Y7s1uuvUGZvEvf6rzGnJjM96yghca1tL5fRH4N',
    '5kFm495wLYqo3tgaxgzihtLh8akm9axKuYj8BQxj9tU6',
    'BbqdiLbz9YQh16zDD6BvLUd2pBzTiHgddSn8ocRDhWoJ',
    'Gt9PAgrMoe7B9pLLGWvVJMSigKPj6C54GhoAorACHsGV',
    '4Hvkwnrzprmg21R75vkkdZ5HmQeEbRsiaJV8GnvevwGj',
    'FMgaCpVLXta1HkjhEHEDsrCEbuxkk3o8bTgapd6E5uUH',
    'DrbA97qqNXjSTB8GDjyDmHANiSvsmcTyKSGNg4UU2MES',
    'HiigV1tD7SNHBFZDYU1uMFx6EKgtqYcVVGrcZ737DoSE',
    'GUEQCffphxPKPEJcpbs39GgvcomuKgPvxdeAcY3qwH9m',
    'CYZn2JcZFyJw6j4CGDftEv3W79U2xBBEmeakCaysx3jh',
    'BvpKYy47yWUkNTRDtSbjXSSmH4rwXF4SqtC1QwfB7p3n',
    '2saU4mnxuJqx2Xd7EV6bm1k5kAyLFBsMeVaHW5g2pU6f',
    '7i6DNW94SiXi1VULMK86mJaEpR8s1B2ZZLJZvAMo3aUU',
    '2RmW3gaZGhfN6NTTCW7PctjNZNzJteveZrReMVVnLNyQ',
    '2pYPZBwUdpL8MZjFjA54Q3S7D5qMgEJvJhZKS3DNyQd8',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    '2Nsm9BoZ5kgttWjrAM4eAay3rM4yQUJv5E6ajhtPAzUa',
    '636HRoiYbfSCiB9BPc7AaiTtCpYYfb8y9YxDV2NTDmHa',
    '7yPUz7dVM1y4xDvAoowfAmt1u4v2TJ4S2zQCm1uHMpgU',
    'BVcW33GXQQtLfxEU9CjoALQzyyTXuxthNAUhrD4AJLpa',
    '9jyP4CNxST2oHLpfKJGtAkDMnvo7ztaAUqvsvDcnAME7',
    '8RozHW6oDgYpEPwW3A5bUVn1bDXDXqFUeAwQaCH97a6E',
    'DaQM6b6dbxShqjRdaxPEgMorgjtRtdpfPJWkWYrKgNPa',
    '6U91aKa8pmMxkJwBCfPTmUEfZi6dHe7DcFq2ALvB2tbB',
    'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2',
    'BDeRxgPjcNrJEPsXgfiK9K5G7756mUfoVKGatzS8KAy4',
    '41Tv1eoXFVC13Wxp7FpWHnc6tHi4QpB6xtU1texNthSa',
    'Ey5ytsgj5MAoW1GA4n3H3UYMddds4eJ1CtttZcUfqafq',
    'ZG98FUCjb8mJ824Gbs6RsgVmr1FhXb2oNiJHa2dwmPd',
    'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN',
    '71WDyyCsZwyEYDV91Qrb212rdg6woCHYQhFnmZUBxiJ6',
    'EccxYg7rViwYfn9EMoNu7sUaV82QGyFt6ewiQaH1GYjv',
    'AfQ1oaudsGjvznX4JNEw671hi57JfWo4CWqhtkdgoVHU',
    'JTJ9Cz7i43DBeps5PZdX1QVKbEkbWegBzKPxhWgkAf1',
    '45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp',
  ];
}
