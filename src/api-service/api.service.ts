import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import { delay, firstValueFrom, of } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { Keypair, Transaction, Connection, clusterApiUrl, Cluster, PublicKey, TransactionSignature, LAMPORTS_PER_SOL, SystemProgram, ParsedTransactionWithMeta, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { decode } from 'bs58';
import { get, isEmpty, isNil } from 'lodash';
import { Org } from '../orgs/schema/org.schema';
import { ConfigService } from '@nestjs/config';

const REQUEST_TIMEOUT = 1000 * 60 * 60;
const RETRIES = 5;

@Injectable()
export class ApiService {
  private readonly telegramToken: string;
  private readonly telegramChatId: string;


  constructor(private http: HttpService, private readonly configService: ConfigService) {
    this.telegramToken = configService.get<string>('TELEGRAM_TOKEN') as string;
    this.telegramChatId = configService.get<string>('TELEGRAM_CHAT_ID') as string;
    this.tgBaseUrl = `https://api.telegram.org/bot${this.telegramToken}`;
  }

  tgBaseUrl: string;
  shyftBaseUrl = 'https://api.shyft.to/sol/v1';
  solscanBaseUrl = 'https://public-api.solscan.io';
  network: Cluster = process.env.NETWORK as Cluster;
  connection = new Connection(clusterApiUrl(this.network), 'confirmed');
  usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
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
      await firstValueFrom(this.http.post(`${this.tgBaseUrl}/sendMessage`, {
        chat_id: this.telegramChatId,
        text: text,
      }));
    } catch (err) {
      console.log(`Notification error: ${err.message}`);
    }
  }

  async getTokenHolders(mint: string) {
    const config: AxiosRequestConfig = {
      headers: {
        token: process.env.SOLSCAN_APIKEY,
      },
      params: {
        tokenAddress: mint,
        limit: 100,
      },
      timeout: REQUEST_TIMEOUT,
    };
    try {
      const response = await firstValueFrom(this.http.get(`${this.solscanBaseUrl}/token/holders`, config));
      return get(response, 'data.data');
    } catch (err) {
      err.message = `Error fetching token holders: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
  }

  async transfer(senderPk: string, mint: string, recepients: { wallet: string, amount: number }[], retries = 0) {
    try {
      const multiplier = mint === this.usdcMint ? 1000000 : LAMPORTS_PER_SOL;
      const mintPublicKey = new PublicKey(mint);
      const senderKeypair = Keypair.fromSecretKey(decode(senderPk));
      const senderAssociatedTokenAddress = await getAssociatedTokenAddress(
        mintPublicKey,
        senderKeypair.publicKey,
      );
      const payer = this.isMainnet ? new PublicKey(process.env.FEE_PAYER) : senderKeypair.publicKey;
      const txn = new Transaction();

      const promises = recepients.map(async ({ wallet, amount }) => {
        console.log('amount:', amount);
        console.log('wallet:', wallet);
        const recipientPublicKey = new PublicKey(wallet);

        const recipientAssociatedTokenAddress = await getAssociatedTokenAddress(
          mintPublicKey,
          recipientPublicKey,
        );

        try {
          await getAccount(this.connection, recipientAssociatedTokenAddress);
        } catch (error) {
          if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
            txn.add(
              createAssociatedTokenAccountInstruction(
                payer,
                recipientAssociatedTokenAddress,
                new PublicKey(wallet),
                mintPublicKey,
              )
            );
          }
        }

        txn.add(
          createTransferInstruction(
            senderAssociatedTokenAddress,
            recipientAssociatedTokenAddress,
            senderKeypair.publicKey,
            Math.round(amount * multiplier),
          )
        );
      });

      await Promise.all(promises);

      const blockhash = (await this.connection.getLatestBlockhash('finalized'));
      txn.recentBlockhash = blockhash.blockhash;
      txn.feePayer = this.isMainnet ? new PublicKey(process.env.FEE_PAYER) : senderKeypair.publicKey;

      const serializedTxn = this.createSignedSerializedTxn(txn, senderPk, false, false);
      const signature = await this.sendTxn(serializedTxn);
      return signature;
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log(`Retrying transfer, retries left: ${retries}`);
        return this.transfer(senderPk, mint, recepients, --retries);
      }
      err.message = `Error transfering tokens: ${err.message}`;
      throw err;
    }
  }

  async transferUSDC(senderPk: string, recepients: { wallet: string, amount: number }[]) {
    if (!this.isMainnet || isEmpty(recepients)) {
      return;
    }
    try {
      const signature = await this.transfer(senderPk, this.usdcMint, recepients);
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
        this.http.get(`${this.shyftBaseUrl}/semi_wallet/get_keypair`, config)
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
      const USDCMintPublicKey = new PublicKey(this.usdcMint);

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
      const blockhash = (await this.connection.getLatestBlockhash('finalized'));
      createAccountTxn.recentBlockhash = blockhash.blockhash;
      createAccountTxn.feePayer = new PublicKey(process.env.FEE_PAYER);
      const serializedTxn = this.createSignedSerializedTxn(createAccountTxn, walletPk, false);
      await this.sendTxn(serializedTxn);
    } catch (err) {
      err.message = `Error creating account: ${err.message}`;
      throw err;
    }
  }

  async airdrop(walletAddress: string, password: string) {
    if (this.isMainnet) {
      const pk = await this.getPK(walletAddress, password);
      return this.createAccount(pk);
    }
    const signature: TransactionSignature = await this.connection.requestAirdrop(new PublicKey(walletAddress), LAMPORTS_PER_SOL);
    const blockhash = await this.connection.getLatestBlockhash('finalized');
    await this.connection.confirmTransaction({
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
      signature,
    }, 'finalized');
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
      const response = await firstValueFrom(this.http.post(`${this.shyftBaseUrl}/semi_wallet/create`, body, config));
      const walletAddress = get(response, 'data.result.wallet_address');
      await this.airdrop(walletAddress, password);
      return walletAddress;
    } catch (err) {
      err.message = `Error creating wallet: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
  }

  async sendTxn(txn: string, isRelay = true) {
    const headers = this.commonHeaders;
    headers.set('Content-Type', 'application/json');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers.entries()),
      timeout: REQUEST_TIMEOUT,
    };

    const body = JSON.stringify({
      network: this.network,
      encoded_transaction: txn,
    });
    try {
      const endpoint = this.isMainnet && isRelay ? '/txn_relayer/sign' : '/transaction/send_txn';
      const response = await firstValueFrom(this.http.post(`${this.shyftBaseUrl}${endpoint}`, body, config));
      return get(response, 'data.result.signature', get(response, 'data.result.tx'));
    } catch (err) {
      err.message = `Error sending transaction: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
  }

  async createFungibleTokensForOrganization(org: Org, logo: Buffer): Promise<string> {
    const body = new FormData();
    body.append('network', this.network);
    body.append('wallet', org.wallet);
    body.append('name', org.name.substring(0, 32));
    body.append('symbol', org.username.toUpperCase().substring(0, 10));
    if (this.isMainnet) {
      body.append('fee_payer', process.env.FEE_PAYER);
    }
    body.append('file', logo, 'logo');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders.entries()),
      timeout: REQUEST_TIMEOUT,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(`${this.shyftBaseUrl}/token/create_detach`, body, config),
      );
      const encodedTxn = get(response, 'data.result.encoded_transaction');
      const mint = get(response, 'data.result.mint');
      const txn = Transaction.from(Buffer.from(encodedTxn, 'base64'));
      const pk = await this.getPK(org.wallet, org.password);
      const serializedTxn = this.createSignedSerializedTxn(txn, pk, true, false);
      await this.sendTxn(serializedTxn);
      return mint;
    } catch (err) {
      err.message = `Error creating token: ${err.message}`;
      throw err;
    }
  }
  async mintToken(mint: string, authorityPk: string, receivers: { wallet: string, amount: number }[], memo?: string) {
    try {
      const authorityKeypair = Keypair.fromSecretKey(decode(authorityPk));
      const payer = new PublicKey(this.isMainnet ? process.env.FEE_PAYER : authorityKeypair.publicKey);
      const txn = new Transaction();
      const promises = receivers.map(async ({ wallet, amount }) => {
        const associatedTokenAddress = getAssociatedTokenAddressSync(
          new PublicKey(mint),
          new PublicKey(wallet),
        );
        try {
          await getAccount(this.connection, associatedTokenAddress);
        } catch (error) {
          if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
            txn.add(
              createAssociatedTokenAccountInstruction(
                payer,
                associatedTokenAddress,
                new PublicKey(wallet),
                new PublicKey(mint),
              )
            );
          }
        }
        txn.add(createMintToInstruction(
          new PublicKey(mint),
          associatedTokenAddress,
          new PublicKey(authorityKeypair.publicKey),
          amount,
        ));
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
            })
          );
        }
      });
      await Promise.all(promises);
      const blockhash = (await this.connection.getLatestBlockhash('finalized'));
      txn.recentBlockhash = blockhash.blockhash;
      txn.feePayer = payer;
      const serializedTxn = this.createSignedSerializedTxn(txn, authorityPk, true, false);
      const txnHash = await this.sendTxn(serializedTxn);
      return txnHash;
    } catch (err) {
      err.message = `Error minting token: ${err.message}`;
      throw err;
    }
  }

  async getUSDCBalance(wallet: string) {
    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders),
      timeout: REQUEST_TIMEOUT,
      params: {
        network: this.network,
        wallet,
        token: this.usdcMint,
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.get(`${this.shyftBaseUrl}/wallet/token_balance`, config),
      );
      return get(response, 'data.result.balance');
    } catch (err) {
      err.message = `Error getting USDC balance: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
  }

  async getParsedTransaction(signature: TransactionSignature, retries = RETRIES): Promise<ParsedTransactionWithMeta> {
    const fn = async (r: number) => {
      let txn: ParsedTransactionWithMeta;
      let error: any;
      try {
        const connection = new Connection(clusterApiUrl(this.network), {
          commitment: 'confirmed',
          disableRetryOnRateLimit: true,
        });
        txn = await connection.getParsedTransaction(signature, 'confirmed');
      } catch (err) {
        error = err;
      }
      if ((isNil(txn) || !isNil(error)) && r > 0) {
        await firstValueFrom(of(true).pipe(delay((retries - (r - 1)) * 10000)));
        console.log(`Retrying getting txn ${r}: ${error}`);
        return this.getParsedTransaction(signature, --r);
      }
      return txn;
    };
    return fn(retries);
  }


  async getTokenHistory(wallet: string, mint: string): Promise<{
    associatedAddress: PublicKey,
    parsedTxns: ParsedTransactionWithMeta[],
  }> {
    const mintPublicKey = new PublicKey(mint);
    const associatedAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      new PublicKey(wallet),
    );
    const txns = await this.connection.getSignaturesForAddress(associatedAddress);
    const signatures = txns.map((txn) => txn.signature);
    const parsedTxns = await this.connection.getParsedTransactions(signatures);
    return { associatedAddress, parsedTxns };
  }

  async getUSDCHistory(wallet: string): Promise<{
    associatedAddress: PublicKey,
    parsedTxns: ParsedTransactionWithMeta[],
  }> {
    if (!this.isMainnet) {
      return { associatedAddress: new PublicKey(''), parsedTxns: [] };
    }
    return this.getTokenHistory(wallet, this.usdcMint);
  }

  async getAccountInfo(address: string) {
    const accountInfo = await getAccount(this.connection, new PublicKey(address));
    return accountInfo;
  }

  createSignedSerializedTxn(
    transaction: Transaction,
    fromPrivateKey: string,
    requireAllSignatures = true,
    verifySignatures = true,
  ) {
    const fromSigner = Keypair.fromSecretKey(decode(fromPrivateKey));
    transaction.partialSign(fromSigner);
    const serializedTxn = transaction.serialize({ requireAllSignatures, verifySignatures }).toString('base64');
    return serializedTxn;
  }

  buildExplorerLink(endpoint: string) {
    return `${this.explorerUrl}${endpoint}`;
  }

  async confirmTxnWithRetry(
    txnHash: string,
    retryFn: () => Promise<string>,
    retries = 5,
  ): Promise<string> {
    const parsedTxn = await this.getParsedTransaction(txnHash);
    let txnError = get(parsedTxn, 'meta.err');
    if (!isNil(parsedTxn) && isNil(txnError)) {
      return txnHash;
    }
    try {
      txnHash = await retryFn();
    } catch (err) {
      txnError = err.message;
    }
    if (!isNil(txnError) && retries > 0) {
      console.log(`Retrying txn ${txnHash}: ${txnError}`);
      return this.confirmTxnWithRetry(txnHash, retryFn, --retries);
    }
    throw txnError;
  }
}
