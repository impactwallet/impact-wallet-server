import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { Keypair, Transaction, Connection, clusterApiUrl, Cluster, PublicKey, SystemProgram, TransactionSignature, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { decode } from 'bs58';
import { get } from 'lodash';
import { Org } from '../orgs/schema/org.schema';

@Injectable()
export class ApiService {
  baseUrl = 'https://api.shyft.to/sol/v1';
  network: Cluster = 'mainnet-beta';
  connection = new Connection(clusterApiUrl(this.network), 'confirmed');

  constructor(private http: HttpService) { }

  get commonHeaders() {
    const headers = new Map();
    headers.set('x-api-key', 'T8Ghb4y-HwYxdqNK');
    return headers;
  }

  async getPK(wallet: string, password: string) {
    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders.entries()),
      params: {
        wallet,
        password,
      },
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

  async createWallet(password: string) {
    const headers = this.commonHeaders;
    headers.set('Content-Type', 'application/json');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers),
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
      });
      return walletAddress;
    } catch (err) {
      err.message = `Error creating wallet: ${err.message}`;
      throw err;
    }
  }

  async sendTxn(txn: string) {
    const headers = this.commonHeaders;
    headers.set('Content-Type', 'application/json');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers.entries()),
    };

    const body = JSON.stringify({
      network: this.network,
      encoded_transaction: txn,
    });
    try {
      const response = await firstValueFrom(this.http.post(`${this.baseUrl}/transaction/send_txn`, body, config));
      return get(response, 'data.result.signature');
    } catch (err) {
      err.message = `Error sending transaction: ${err.message}`;
      throw err;
    }
  }

  async getParsedTransaction(txn: Transaction) {
    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders.entries()),
      params: {
        network: this.network,
        txn_signature: txn.signature,
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.get(`${this.baseUrl}/transaction/parsed`, config)
      );
      return get(response, 'data.result');
    } catch (err) {
      err.message = `Error getting parsed transaction: ${err.message}`;
      throw err;
    }
  }

  async getFee(txn: Transaction) {
    const response = await this.connection.getFeeForMessage(
      txn.compileMessage(),
    );
    return get(response, 'value');
  }

  async transfer(from: string, to: string, pk: string, amount: number) {
    try {
      const fromPublicKey = new PublicKey(from);
      const toPublicKey = new PublicKey(to);
      const txn = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromPublicKey,
          toPubkey: toPublicKey,
          lamports: amount,
        })
      );
      const blockHash = (await this.connection.getLatestBlockhash('finalized'))
        .blockhash;
  
      txn.feePayer = fromPublicKey;
      txn.recentBlockhash = blockHash;

      const serializedTxn = this.createSignedSerializedTxn(txn, pk);
      await this.sendTxn(serializedTxn);
    } catch (err) {
      err.message = `Transfer error: ${err.message}`;
      throw err;
    }
  }

  async createFungibleTokensForOrganization(org: Org) {
    const body = new FormData();
    body.append('network', this.network);
    body.append('wallet', org.wallet);
    body.append('name', org.name);
    body.append('symbol', org.username.toUpperCase());
    body.append('file', Buffer.from(org.logo, 'base64'), 'logo');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(this.commonHeaders.entries()),
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
      return mint;
    } catch (err) {
      err.message = `Error creating token: ${err.message}`;
      throw err;
    }
  }

  async mintToken(org: Org, receiver: string, amount: number) {
    const headers = this.commonHeaders;
    headers.set('Content-Type', 'application/json');

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers),
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
      return this.sendTxn(serializedTxn);
    } catch (err) {
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
