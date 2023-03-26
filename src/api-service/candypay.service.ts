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
    return this.sdk.session.create({
      success_url: 'https://app.impactwallet.xyz',
      cancel_url: 'https://app.impactwallet.xyz',
      items: data.items,
    });
  }
}