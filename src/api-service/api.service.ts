import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import { delay, firstValueFrom, of } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { Keypair, Transaction, Connection, clusterApiUrl, Cluster, PublicKey, TransactionSignature, LAMPORTS_PER_SOL, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createTransferInstruction } from '@solana/spl-token';
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
  network: Cluster = process.env.NETWORK as Cluster;
  connection = new Connection(clusterApiUrl(this.network), 'confirmed');

  constructor(private http: HttpService) { }

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
        chat_id: chatId,
        text: text,
      }));
    } catch (err) {
      console.log(`Notification error: ${err.message}`);
    }
  }

  async transfer(fromPk: string, to: string, amount: number) {
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: Keypair.fromSecretKey(decode(fromPk)).publicKey,
          toPubkey: new PublicKey(to),
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );
      const blockHash = (await this.connection.getLatestBlockhash('finalized'))
        .blockhash;
    
      transaction.feePayer = Keypair.fromSecretKey(decode(fromPk)).publicKey;
      transaction.recentBlockhash = blockHash;
      await sendAndConfirmTransaction(this.connection, transaction, [Keypair.fromSecretKey(decode(fromPk))]);
    } catch (err) {
      err.message = `Error getting wallet PK: ${err.message}`;
      throw err;
    }
  }

  async transferUSDC(sender: string, recipient: string, amount: number) {
    if (this.network !== 'mainnet-beta') {
      return;
    }
    console.log('amount:', amount);
    console.log('recipient:', recipient);
    console.log('sender:', sender);
    try {
      const senderPublicKey = new PublicKey(sender);
      const recipientPublicKey = new PublicKey(recipient);
      const USDCMintPublicKey = new PublicKey('USD Coin mint address');
  
      const senderAssociatedTokenAddress = await getAssociatedTokenAddress(
        USDCMintPublicKey,
        senderPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
  
      const recipientAssociatedTokenAddress = await getAssociatedTokenAddress(
        USDCMintPublicKey,
        recipientPublicKey,
        true,
      );

      const txn = new Transaction();
      txn.add(
        createTransferInstruction(
          senderAssociatedTokenAddress,
          recipientAssociatedTokenAddress,
          senderPublicKey,
          amount * 1000000,
        )
      );
      const blockhash = (await this.connection.getLatestBlockhash('finalized'));
      txn.recentBlockhash = blockhash.blockhash;

      const serializedTxn = txn.serialize().toString('base64');
      await this.sendTxn(serializedTxn);
    } catch (err) {
      err.message = `Error transfering USDC: ${err.message}`;
      console.log(err.message);
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
      throw err;
    }
  }

  async createAccount(walletPk: string, retries = RETRIES) {
    try {
      const space = 0;
      const toKeypair = Keypair.fromSecretKey(decode(walletPk));
      const rentExemptionAmount =
          await this.connection.getMinimumBalanceForRentExemption(space);
    
      const createAccountParams = {
        fromPubkey: new PublicKey(process.env.FEE_PAYER),
        newAccountPubkey: toKeypair.publicKey,
        lamports: rentExemptionAmount,
        space,
        programId: SystemProgram.programId,
      };
    
    
      const createAccountTxn = new Transaction().add(
        SystemProgram.createAccount(createAccountParams)
      );
      const blockhash = (await this.connection.getLatestBlockhash('finalized'));
      createAccountTxn.recentBlockhash = blockhash.blockhash;
      createAccountTxn.feePayer = new PublicKey(process.env.FEE_PAYER);
      const serializedTxn = this.createSignedSerializedTxn(createAccountTxn, walletPk, false);
      await this.sendTxn(serializedTxn);
    } catch (err) {
      if (retries > 0) {
        await firstValueFrom(of(true).pipe(delay(2000)));
        console.log('Retrying creating account');
        return this.createAccount(walletPk, --retries);
      }
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

  async createWallet(password: string, isAirdropNeeded = false) {
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
      if (isAirdropNeeded) {
        await this.airdrop(walletAddress, password);
      }
      await this.sendNotification(`New wallet created: ${walletAddress}`);
      return walletAddress;
    } catch (err) {
      err.message = `Error creating wallet: ${err.message}`;
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
      return get(response, 'data.result.signature');
    } catch (err) {
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
    if (this.isMainnet) {
      body.append('fee_payer', process.env.FEE_PAYER);
    }
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
      const serializedTxn = this.createSignedSerializedTxn(txn, pk, true, false);
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
      mint_authority: org.wallet,
      receiver,
      token_address: org.mint,
      amount,
      fee_payer: this.isMainnet ? process.env.FEE_PAYER : undefined,
    });

    try {
      const response = await firstValueFrom(
        this.http.post(`${this.baseUrl}/token/mint_detach`, body, config),
      );
      const encodedTxn = get(response, 'data.result.encoded_transaction');
      const txn = Transaction.from(Buffer.from(encodedTxn, 'base64'));
      const pk = await this.getPK(org.wallet, org.password);
      const serializedTxn = this.createSignedSerializedTxn(txn, pk, true, false);
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
}
