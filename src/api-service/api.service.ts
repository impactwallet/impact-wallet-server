import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { Keypair, Transaction, Connection, clusterApiUrl, Cluster, PublicKey, TransactionSignature, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { decode } from 'bs58';
import { get, isEmpty, truncate } from 'lodash';
import { Org } from '../orgs/schema/org.schema';
import { ConfigService } from '@nestjs/config';

const REQUEST_TIMEOUT = 1000 * 60 * 60;


@Injectable()
export class ApiService {
  private readonly telegramToken: string = '';
  private readonly telegramChatId: string;


  constructor(private http: HttpService, private readonly configService: ConfigService) {
    this.telegramToken = configService.get<string>('TELEGRAM_TOKEN') as string;
    this.telegramChatId = configService.get<string>('TELEGRAM_CHAT_ID') as string;
  }

  tgBaseUrl = `https://api.telegram.org/bot${this.telegramToken}`;
  baseUrl = 'https://api.shyft.to/sol/v1';
  network: Cluster = process.env.NETWORK as Cluster;
  connection = new Connection(clusterApiUrl(this.network), 'confirmed');
  usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
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

  async transfer(senderPk: string, mint: string, recepients: { wallet: string, amount: number }[]) {
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
        this.http.get(`${this.baseUrl}/semi_wallet/get_keypair`, config)
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
      const USDCMintPublicKey = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

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
      const response = await firstValueFrom(this.http.post(`${this.baseUrl}/semi_wallet/create`, body, config));
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
      const response = await firstValueFrom(this.http.post(`${this.baseUrl}${endpoint}`, body, config));
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
    body.append('name', truncate(org.name, { length: 32 }));
    body.append('symbol', truncate(org.username.toUpperCase(), { length: 10 }));
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
        this.http.post(`${this.baseUrl}/token/create_detach`, body, config),
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
  async mintToken(org: Org, receivers: { wallet: string, amount: number }[]) {
    try {
      const payer = new PublicKey(this.isMainnet ? process.env.FEE_PAYER : org.wallet);
      const orgPk = await this.getPK(org.wallet, org.password);
      const txn = new Transaction();
      const promises = receivers.map(async ({ wallet, amount }) => {
        const associatedTokenAddress = getAssociatedTokenAddressSync(
          new PublicKey(org.mint),
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
                new PublicKey(org.mint),
              )
            );
          }
        }
        txn.add(createMintToInstruction(
          new PublicKey(org.mint),
          associatedTokenAddress,
          new PublicKey(org.wallet),
          amount,
        ));
      });
      await Promise.all(promises);
      const blockhash = (await this.connection.getLatestBlockhash('finalized')).blockhash;
      txn.recentBlockhash = blockhash;
      txn.feePayer = payer;
      const serializedTxn = this.createSignedSerializedTxn(txn, orgPk, true, false);
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
        this.http.get(`${this.baseUrl}/wallet/token_balance`, config),
      );
      return get(response, 'data.result.balance');
    } catch (err) {
      err.message = `Error getting USDC balance: ${err.message}`;
      console.log(JSON.stringify(get(err, 'response.data', err)));
      throw err;
    }
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
}
