import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import { delay, firstValueFrom, of } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { Keypair, Transaction, Connection, clusterApiUrl, Cluster, PublicKey, TransactionSignature, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { decode } from 'bs58';
import { get } from 'lodash';
import { Org } from '../orgs/schema/org.schema';

const REQUEST_TIMEOUT = 1000 * 60 * 60;
const RETRIES = 5;

/* BOT DATA */
const telegramToken = '6103482568:AAHcXVbsPbSATe9Q06LukA2mp0-gku1cJKE';
const chatId = -963260569;


@Injectable()
export class ApiService {
  tgBaseUrl = `https://api.telegram.org/bot${telegramToken}`;
  baseUrl = 'https://api.shyft.to/sol/v1';
  network: Cluster = 'devnet';
  connection = new Connection(clusterApiUrl(this.network), 'confirmed');

  constructor(private http: HttpService) { }

  get commonHeaders() {
    const headers = new Map();
    headers.set('x-api-key', 'T8Ghb4y-HwYxdqNK');
    return headers;
  }

  async sendNotification(text: string) {
    try {
      await firstValueFrom(this.http.post(`${this.tgBaseUrl}/sendMessage`, {
        chat_id: chatId,
        text: text,
      }));
    } catch (err) {
      console.log(`Notification error: ${err.message}`);
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
      throw err;
    }
  }

  async createWallet(password: string, retries = RETRIES) {
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
      const signature: TransactionSignature = await this.connection.requestAirdrop(new PublicKey(walletAddress), LAMPORTS_PER_SOL);
      const blockhash = await this.connection.getLatestBlockhash('finalized');
      await this.connection.confirmTransaction({
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        signature,
      }, 'finalized');
      await this.sendNotification(`New wallet created: ${walletAddress}`);
      return walletAddress;
    } catch (err) {
      if (retries > 0) {
        await firstValueFrom(of(true).pipe(delay(2000)));
        console.log('Retrying create wallet');
        return this.createWallet(password, --retries);
      }
      err.message = `Error creating wallet: ${err.message}`;
      throw err;
    }
  }

  async sendTxn(txn: string, retries = RETRIES) {
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
      const response = await firstValueFrom(this.http.post(`${this.baseUrl}/transaction/send_txn`, body, config));
      return get(response, 'data.result.signature');
    } catch (err) {
      if (retries > 0) {
        await firstValueFrom(of(true).pipe(delay(2000)));
        console.log('Retrying sending transaction');
        return this.sendTxn(txn, --retries);
      }
      err.message = `Error sending transaction: ${err.message}`;
      throw err;
    }
  }

  async createFungibleTokensForOrganization(org: Org, retries = RETRIES): Promise<string> {
    const body = new FormData();
    body.append('network', this.network);
    body.append('wallet', org.wallet);
    body.append('name', org.name);
    body.append('symbol', org.username.toUpperCase());
    body.append('file', Buffer.from(org.logo, 'base64'), 'logo');

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
      const serializedTxn = this.createSignedSerializedTxn(txn, pk);
      await this.sendTxn(serializedTxn);
      await this.sendNotification(`New token created: ${mint}`);
      return mint;
    } catch (err) {
      if (retries > 0) {
        await firstValueFrom(of(true).pipe(delay(2000)));
        console.log('Retrying create token');
        return this.createFungibleTokensForOrganization(org, --retries);
      }
      err.message = `Error creating token: ${err.message}`;
      throw err;
    }
  }

  async mintToken(org: Org, receiver: string, amount: number, retries = RETRIES) {
    const headers = this.commonHeaders;
    headers.set('Content-Type', 'application/json');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers),
      timeout: REQUEST_TIMEOUT,
    };

    const body = JSON.stringify({
      network: this.network,
      wallet: org.wallet,
      receiver,
      token_address: org.mint,
      amount,
    });

    try {
      const response = await firstValueFrom(
        this.http.post(`${this.baseUrl}/token/mint_detach`, body, config),
      );
      const encodedTxn = get(response, 'data.result.encoded_transaction');
      const txn = Transaction.from(Buffer.from(encodedTxn, 'base64'));
      const pk = await this.getPK(org.wallet, org.password);
      const serializedTxn = this.createSignedSerializedTxn(txn, pk);
      const txnHash = await this.sendTxn(serializedTxn);
      await this.sendNotification(`Tokens minted ant sent to a member: ${txnHash}`);
      return txnHash;
    } catch (err) {
      if (retries > 0) {
        await firstValueFrom(of(true).pipe(delay(2000)));
        console.log('Retrying mint token');
        return this.mintToken(org, receiver, amount, --retries);
      }
      err.message = `Error minting token: ${err.message}`;
      throw err;
    }
  }

  createSignedSerializedTxn(transaction: Transaction, fromPrivateKey: string) {
    const feePayer = Keypair.fromSecretKey(decode(fromPrivateKey));
    transaction.partialSign(feePayer);
    const serializedTxn = transaction.serialize().toString('base64');
    return serializedTxn;
  }
}
