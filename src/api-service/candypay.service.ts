import { CandyPay } from '@candypay/checkout-sdk';
import { Injectable } from '@nestjs/common';
import { Cluster } from '@solana/web3.js';
import { CreateCpSessionDto } from './dto/create-cp-session.dto';

@Injectable()
export class CandyPayService {
  sdk = new CandyPay({
    api_keys: {
      public_api_key: process.env.CANDYPAY_PUBKEY,
      private_api_key: process.env.CANDYPAY_KEY,
    },
    network: process.env.NETWORK as Cluster === 'mainnet-beta' ? 'mainnet' : 'devnet',
    config: { collect_shipping_address: false },
  });

  createSession(data: CreateCpSessionDto) {
    const tokens: any = ['usdt'];
    return this.sdk.session.create({
      success_url: 'https://app.equitywallet.org',
      cancel_url: 'https://app.equitywallet.org',
      items: data.items,
      tokens: tokens,
      custom_data: {
        name: data.receiver.name,
        image: `${process.env.SERVER_URL}${data.logo}`,
        wallet_address: data.receiver.wallet,
      },
    });
  }
}