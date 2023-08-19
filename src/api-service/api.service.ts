import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import {
  Cluster,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  PublicKey,
  sendAndConfirmTransaction,
  SignaturesForAddressOptions,
  Signer,
  SystemProgram,
  TokenAmount,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { decode } from 'bs58';
import { get, isEmpty, isNil } from 'lodash';
import { Org } from '../orgs/schema/org.schema';
import { ConfigService } from '@nestjs/config';
import { delay } from 'bluebird';

const REQUEST_TIMEOUT = 1000 * 60 * 60;
const RETRIES = 5;

@Injectable()
export class ApiService {
  private readonly telegramToken: string;
  private readonly telegramChatId: string;

  constructor(
    private http: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.telegramToken = configService.get<string>('TELEGRAM_TOKEN') as string;
    this.telegramChatId = configService.get<string>(
      'TELEGRAM_CHAT_ID',
    ) as string;
    this.tgBaseUrl = `https://api.telegram.org/bot${this.telegramToken}`;
  }

  tgBaseUrl: string;
  shyftBaseUrl = 'https://api.shyft.to/sol/v1';
  network: Cluster = process.env.NETWORK as Cluster;
  connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
  memoProgramId = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  explorerUrl = 'https://explorer.solana.com';

  get commonHeaders() {
    const headers = new Map();
    headers.set('x-api-key', process.env.SHYFT_KEY);
    return headers;
  }

  get isMainnet() {
    return this.network === 'mainnet-beta';
  }

  async sendNotification(text: string) {
    if (process.env.NOTIFICATIONS_ENABLED !== 'true') {
      return;
    }
    try {
      await firstValueFrom(
        this.http.post(`${this.tgBaseUrl}/sendMessage`, {
          chat_id: this.telegramChatId,
          text: text,
        }),
      );
    } catch (err) {
      console.log(`Notification error: ${err.message}`);
    }
  }

  async getTokenHolders(mint: string) {
    return this.connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { dataSize: 165 },
        {
          memcmp: {
            offset: 0,
            bytes: mint,
          },
        },
      ],
    });
  }

  async createTokenAccountInstruction(mint: string, owner: string) {
    const mintPublicKey = new PublicKey(mint);
    const recipientPublicKey = new PublicKey(owner);
    const recipientAssociatedTokenAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      recipientPublicKey,
    );
    const payer = new PublicKey(process.env.FEE_PAYER);
    try {
      await getAccount(this.connection, recipientAssociatedTokenAddress);
    } catch (error) {
      if (
        error instanceof TokenAccountNotFoundError ||
        error instanceof TokenInvalidAccountOwnerError
      ) {
        return createAssociatedTokenAccountInstruction(
          payer,
          recipientAssociatedTokenAddress,
          new PublicKey(owner),
          mintPublicKey,
        );
      }
    }
  }

  async createTransferInstructions(
    mint: string,
    recepients: { senderPk: string; wallet: string; amount: number }[],
  ): Promise<TransactionInstruction[]> {
    const multiplier =
      mint === process.env.USDC_MINT ? 1000000 : LAMPORTS_PER_SOL;
    const mintPublicKey = new PublicKey(mint);
    const instructionsPromises = recepients.map(
      async ({ senderPk, wallet, amount }) => {
        console.log('amount:', amount);
        console.log('wallet:', wallet);
        const senderKeypair = Keypair.fromSecretKey(decode(senderPk));
        const senderAssociatedTokenAddress = await getAssociatedTokenAddress(
          mintPublicKey,
          senderKeypair.publicKey,
        );
        const recipientPublicKey = new PublicKey(wallet);

        const recipientAssociatedTokenAddress = await getAssociatedTokenAddress(
          mintPublicKey,
          recipientPublicKey,
        );

        return createTransferInstruction(
          senderAssociatedTokenAddress,
          recipientAssociatedTokenAddress,
          senderKeypair.publicKey,
          Math.round(amount * multiplier),
        );
      },
    );
    return Promise.all(instructionsPromises);
  }

  async transfer(
    mint: string,
    recepients: { senderPk: string; wallet: string; amount: number }[],
    retries = 0,
  ) {
    try {
      const txn = new Transaction();
      const tokenAccountInstructions = await Promise.all(
        recepients.map(({ wallet }) =>
          this.createTokenAccountInstruction(mint, wallet),
        ),
      );
      tokenAccountInstructions.forEach((instruction) => {
        if (!isNil(instruction)) {
          txn.add(instruction);
        }
      });

      const transferInstructions = await this.createTransferInstructions(
        mint,
        recepients,
      );
      transferInstructions.forEach((instruction) => {
        txn.add(instruction);
      });

      const blockhash = await this.connection.getLatestBlockhash('finalized');
      txn.recentBlockhash = blockhash.blockhash;
      txn.feePayer = new PublicKey(process.env.FEE_PAYER);
      const feePayerPk = await this.getPK(
        process.env.FEE_PAYER,
        process.env.FEE_PAYER_PWD,
      );

      const signers = recepients.map(({ senderPk }) =>
        Keypair.fromSecretKey(decode(senderPk)),
      );
      const signature = await this.sendTxn(txn, [
        ...signers,
        Keypair.fromSecretKey(decode(feePayerPk)),
      ]);
      return signature;
    } catch (err) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log(`Retrying transfer, retries left: ${retries}`);
        return this.transfer(mint, recepients, --retries);
      }
      err.message = `Error transferring tokens: ${err.message}`;
      throw err;
    }
  }

  async createAndSendTxn(
    instructions: TransactionInstruction[],
    pks: string[],
    retries = 0,
  ) {
    try {
      const txn = new Transaction();

      instructions.forEach((instruction) => {
        if (!isNil(instruction)) {
          txn.add(instruction);
        }
      });

      if (isEmpty(txn.instructions)) {
        return;
      }

      const feePayerPk = await this.getPK(
        process.env.FEE_PAYER,
        process.env.FEE_PAYER_PWD,
      );
      txn.feePayer = new PublicKey(process.env.FEE_PAYER);
      const signers = pks.map((pk) => Keypair.fromSecretKey(decode(pk)));
      const blockhash = await this.connection.getLatestBlockhash('finalized');
      txn.recentBlockhash = blockhash.blockhash;

      const signature = await this.sendTxn(
        txn,
        signers.concat(Keypair.fromSecretKey(decode(feePayerPk))),
      );
      return signature;
    } catch (err) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log(`Retrying createAndSendTxn, retries left: ${retries}`);
        return this.createAndSendTxn(instructions, pks, --retries);
      }
      err.message = `Error in createAndSendTxn: ${err.message}`;
      throw err;
    }
  }

  async transferUSDC(
    recepients: { senderPk: string; wallet: string; amount: number }[],
  ) {
    if (isEmpty(recepients)) {
      return;
    }
    try {
      const signature = await this.transfer(process.env.USDC_MINT, recepients);
      return signature;
    } catch (err) {
      err.message = `Error transfering USDC: ${err.message}`;
      throw err;
    }
  }

  async getPK(wallet: string, password: string) {
    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders.entries()),
      params: {
        wallet,
        password,
      },
      timeout: REQUEST_TIMEOUT,
    };

    try {
      const response = await firstValueFrom(
        this.http.get(`${this.shyftBaseUrl}/semi_wallet/get_keypair`, config),
      );
      return get(response, 'data.result.secretKey');
    } catch (err) {
      err.message = `Error getting wallet PK: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
  }

  async createAccount(walletPk: string) {
    try {
      const space = 0;
      const toKeypair = Keypair.fromSecretKey(decode(walletPk));
      const rentExemptionAmount =
        await this.connection.getMinimumBalanceForRentExemption(space);
      const USDCMintPublicKey = new PublicKey(process.env.USDC_MINT);

      const createAccountParams = {
        fromPubkey: new PublicKey(process.env.FEE_PAYER),
        newAccountPubkey: toKeypair.publicKey,
        lamports: rentExemptionAmount,
        space,
        programId: SystemProgram.programId,
      };

      const associatedToken = await getAssociatedTokenAddress(
        USDCMintPublicKey,
        toKeypair.publicKey,
        false,
      );
      const createAccountTxn = new Transaction().add(
        SystemProgram.createAccount(createAccountParams),
        createAssociatedTokenAccountInstruction(
          new PublicKey(process.env.FEE_PAYER),
          associatedToken,
          toKeypair.publicKey,
          USDCMintPublicKey,
        ),
      );
      const blockhash = await this.connection.getLatestBlockhash('finalized');
      createAccountTxn.recentBlockhash = blockhash.blockhash;
      createAccountTxn.feePayer = new PublicKey(process.env.FEE_PAYER);
      const feePayerPk = await this.getPK(
        process.env.FEE_PAYER,
        process.env.FEE_PAYER_PWD,
      );
      await this.sendTxn(createAccountTxn, [
        toKeypair,
        Keypair.fromSecretKey(decode(feePayerPk)),
      ]);
    } catch (err) {
      err.message = `Error creating account: ${err.message}`;
      throw err;
    }
  }

  async airdrop(walletAddress: string, password: string) {
    if (this.isMainnet) {
      return;
    }
    const signature: TransactionSignature =
      await this.connection.requestAirdrop(
        new PublicKey(walletAddress),
        LAMPORTS_PER_SOL,
      );
    const blockhash = await this.connection.getLatestBlockhash('finalized');
    await this.connection.confirmTransaction(
      {
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        signature,
      },
      'finalized',
    );
  }

  async createWallet(password: string) {
    const headers = this.commonHeaders;
    headers.set('Content-Type', 'application/json');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers),
      timeout: REQUEST_TIMEOUT,
    };

    const body = JSON.stringify({ password });
    try {
      const response = await firstValueFrom(
        this.http.post(`${this.shyftBaseUrl}/semi_wallet/create`, body, config),
      );
      const walletAddress = get(response, 'data.result.wallet_address');
      return walletAddress;
    } catch (err) {
      err.message = `Error creating wallet: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
  }

  async sendTxn(txn: Transaction, signers: Signer[]) {
    try {
      const txnHash = await sendAndConfirmTransaction(
        this.connection,
        txn,
        signers,
      );
      return txnHash;
    } catch (err) {
      err.message = `Error sending transaction: ${err.message}`;
      throw err;
    }
  }

  async createFungibleTokensForOrganization(org: Org, logo: Buffer) {
    const body = new FormData();
    body.append('network', this.network);
    body.append('wallet', org.wallet);
    body.append('name', org.name.substring(0, 32));
    body.append('symbol', org.username.toUpperCase().substring(0, 10));
    body.append('fee_payer', process.env.FEE_PAYER);
    body.append('file', logo, 'logo');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders.entries()),
      timeout: REQUEST_TIMEOUT,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.shyftBaseUrl}/token/create_detach`,
          body,
          config,
        ),
      );
      const encodedTxn = get(response, 'data.result.encoded_transaction');
      const mint = get(response, 'data.result.mint');
      const txn = Transaction.from(Buffer.from(encodedTxn, 'base64'));
      const pk = await this.getPK(org.wallet, org.password);
      const feePayerPk = await this.getPK(
        process.env.FEE_PAYER,
        process.env.FEE_PAYER_PWD,
      );
      const serializedTxn = this.createSignedSerializedTxn(txn, [
        pk,
        feePayerPk,
      ]);
      const txnHash = await this.connection.sendRawTransaction(
        Buffer.from(serializedTxn, 'base64'),
      );
      const latestBlockHash = await this.connection.getLatestBlockhash();
      const confirmStrategy = {
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txnHash,
      };
      await this.connection.confirmTransaction(confirmStrategy);
      return { mint, txnHash };
    } catch (err) {
      err.message = `Error creating token: ${err.message}`;
      throw err;
    }
  }
  async mintToken(
    mint: string,
    authorityPk: string,
    receivers: { wallet: string; amount: number }[],
    memo?: string,
  ) {
    try {
      const authorityKeypair = Keypair.fromSecretKey(decode(authorityPk));
      const payer = new PublicKey(process.env.FEE_PAYER);
      const txn = new Transaction();
      const promises = receivers.map(async ({ wallet, amount }) => {
        const associatedTokenAddress = getAssociatedTokenAddressSync(
          new PublicKey(mint),
          new PublicKey(wallet),
        );
        try {
          await getAccount(this.connection, associatedTokenAddress);
        } catch (error) {
          if (
            error instanceof TokenAccountNotFoundError ||
            error instanceof TokenInvalidAccountOwnerError
          ) {
            txn.add(
              createAssociatedTokenAccountInstruction(
                payer,
                associatedTokenAddress,
                new PublicKey(wallet),
                new PublicKey(mint),
              ),
            );
          }
        }
        txn.add(
          createMintToInstruction(
            new PublicKey(mint),
            associatedTokenAddress,
            new PublicKey(authorityKeypair.publicKey),
            amount,
          ),
        );
        if (!isNil(memo)) {
          txn.add(
            new TransactionInstruction({
              keys: [
                {
                  pubkey: authorityKeypair.publicKey,
                  isSigner: true,
                  isWritable: true,
                },
              ],
              data: Buffer.from(memo, 'utf-8'),
              programId: new PublicKey(this.memoProgramId),
            }),
          );
        }
      });
      await Promise.all(promises);
      const blockhash = await this.connection.getLatestBlockhash('finalized');
      txn.recentBlockhash = blockhash.blockhash;
      txn.feePayer = payer;
      const feePayerPk = await this.getPK(
        process.env.FEE_PAYER,
        process.env.FEE_PAYER_PWD,
      );
      const txnHash = await this.sendTxn(txn, [
        authorityKeypair,
        Keypair.fromSecretKey(decode(feePayerPk)),
      ]);
      return txnHash;
    } catch (err) {
      err.message = `Error minting token: ${err.message}`;
      throw err;
    }
  }

  async getTokenBalance(mint: string, wallet: string): Promise<TokenAmount> {
    try {
      await delay(200);
      const associatedAddress = await getAssociatedTokenAddress(
        new PublicKey(mint),
        new PublicKey(wallet),
      );
      const balance = await this.connection.getTokenAccountBalance(
        associatedAddress,
      );
      return balance.value;
    } catch (err) {
      if (err.code === -32602) {
        return { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' };
      } else {
        console.log(`Error getting token balance: ${err.message}`);
        return { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' };
      }
    }
  }

  getUSDCBalance(wallet: string) {
    return this.getTokenBalance(process.env.USDC_MINT, wallet);
  }

  async getParsedTransaction(
    signature: TransactionSignature,
    retries = RETRIES,
  ): Promise<ParsedTransactionWithMeta> {
    const fn = async (r: number) => {
      let txn: ParsedTransactionWithMeta;
      let error: any;
      try {
        txn = await this.connection.getParsedTransaction(
          signature,
          'confirmed',
        );
      } catch (err) {
        error = err;
      }
      if ((isNil(txn) || !isNil(error)) && r > 0) {
        await delay((retries - (r - 1)) * 1000);
        console.log(`Retrying getting txn ${r}: ${error}`);
        return this.getParsedTransaction(signature, --r);
      }
      return txn;
    };
    return fn(retries);
  }

  async getTokenHistory(
    wallet: string,
    mint: string,
    options?: SignaturesForAddressOptions,
  ): Promise<{
    associatedAddress: PublicKey;
    parsedTxns: ParsedTransactionWithMeta[];
  }> {
    const mintPublicKey = new PublicKey(mint);
    const associatedAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      new PublicKey(wallet),
    );
    const txns = await this.connection.getSignaturesForAddress(
      associatedAddress,
      options,
    );
    const signatures = txns.map((txn) => txn.signature);
    const parsedTxns = await this.connection.getParsedTransactions(signatures);
    return { associatedAddress, parsedTxns };
  }

  async getRootAssociatedAddress(): Promise<PublicKey> {
    const rootWallet = process.env.ROOT_PUBKEY;
    const mintPublicKey = new PublicKey(process.env.USDC_MINT);
    return await getAssociatedTokenAddress(
      mintPublicKey,
      new PublicKey(rootWallet),
    );
  }

  async getUSDCHistory(
    wallet: string,
    options?: SignaturesForAddressOptions,
  ): Promise<{
    associatedAddress: PublicKey;
    parsedTxns: ParsedTransactionWithMeta[];
  }> {
    return this.getTokenHistory(wallet, process.env.USDC_MINT, options);
  }

  async getAccountInfo(address: string) {
    const accountInfo = await getAccount(
      this.connection,
      new PublicKey(address),
    );
    return accountInfo;
  }

  createSignedSerializedTxn(
    transaction: Transaction,
    fromPrivateKey: string | string[],
    requireAllSignatures = true,
    verifySignatures = true,
  ) {
    const pks = Array.isArray(fromPrivateKey)
      ? fromPrivateKey
      : [fromPrivateKey];
    pks.forEach((pk) => {
      const fromSigner = Keypair.fromSecretKey(decode(pk));
      const canSign =
        isEmpty(transaction.signatures) ||
        transaction.signatures.some((signature) =>
          signature.publicKey.equals(fromSigner.publicKey),
        );
      if (canSign) {
        transaction.partialSign(fromSigner);
      }
    });
    const serializedTxn = transaction
      .serialize({ requireAllSignatures, verifySignatures })
      .toString('base64');
    return serializedTxn;
  }

  buildExplorerLink(endpoint: string) {
    return `${this.explorerUrl}${endpoint}`;
  }

  async confirmTxnWithRetry(
    txnHash: string,
    retryFn: () => Promise<any>,
    retries = 5,
  ): Promise<string> {
    const parsedTxn = await this.getParsedTransaction(txnHash);
    let txnError = get(parsedTxn, 'meta.err');
    if (!isNil(parsedTxn) && isNil(txnError)) {
      return txnHash;
    }
    try {
      txnHash = await retryFn();
      txnHash = get(txnHash, 'txnHash', txnHash);
    } catch (err) {
      txnError = err.message;
    }
    if (!isNil(txnError) && retries > 0) {
      console.log(`Retrying txn ${txnHash}: ${txnError}`);
      return this.confirmTxnWithRetry(txnHash, retryFn, --retries);
    }
    throw txnError;
  }

  async recordMemo(memo: string, keys: { pubKey: string; pk: string }[]) {
    const payer = new PublicKey(process.env.FEE_PAYER);
    const txn = new Transaction().add(
      new TransactionInstruction({
        keys: keys.map((key) => ({
          pubkey: new PublicKey(key.pubKey),
          isSigner: true,
          isWritable: false,
        })),
        data: Buffer.from(memo, 'utf-8'),
        programId: new PublicKey(this.memoProgramId),
      }),
    );

    const blockhash = await this.connection.getLatestBlockhash('finalized');
    txn.recentBlockhash = blockhash.blockhash;
    txn.feePayer = payer;
    const feePayerPk = await this.getPK(
      process.env.FEE_PAYER,
      process.env.FEE_PAYER_PWD,
    );
    const signers = keys.map((key) => Keypair.fromSecretKey(decode(key.pk)));
    const txnHash = await this.sendTxn(
      txn,
      signers.concat(Keypair.fromSecretKey(decode(feePayerPk))),
    );
    return txnHash;
  }
}
