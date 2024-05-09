import { Injectable } from '@nestjs/common';
import { ApiService } from './api.service';
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { decode } from 'bs58';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { get } from 'lodash';

export enum TokenSymbol {
  DPLN = 'DPLN',
  USDC = 'USDC',
}

@Injectable()
export class DexService {
  quoteBaseUrl = 'https://quote-api.jup.ag/v6';
  priceBaseUrl = 'https://price.jup.ag/v4';

  constructor(private apiService: ApiService) {}

  async getUsdcPrice(symbol: TokenSymbol) {
    const endpointUrl = new URL(`${this.priceBaseUrl}/price`);
    endpointUrl.searchParams.append('ids', symbol);
    endpointUrl.searchParams.append('vsToken', TokenSymbol.USDC);
    const res = await (await fetch(endpointUrl)).json();
    return get(res, `data[${symbol}]`);
  }

  async getSwapInstructions(
    walletPk: string,
    amount: number,
    recipient: string,
  ) {
    if (process.env.ENV !== 'PROD') {
      return this._getSwapInstructionsDev(walletPk, amount, recipient);
    }
    const recipientAssociatedTokenAddress = await getAssociatedTokenAddress(
      new PublicKey(process.env.USDC_MINT),
      new PublicKey(recipient),
    );
    const walletAccount = Keypair.fromSecretKey(decode(walletPk));
    const quoteEndpointUrl = new URL(`${this.quoteBaseUrl}/quote`);
    quoteEndpointUrl.searchParams.append('inputMint', process.env.DEPLAN_MINT);
    quoteEndpointUrl.searchParams.append('outputMint', process.env.USDC_MINT);
    quoteEndpointUrl.searchParams.append(
      'amount',
      Math.floor(amount * 10 ** 6).toString(),
    );
    const quoteResponse = await (await fetch(quoteEndpointUrl)).json();
    const instructions = await (
      await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: walletAccount.publicKey.toBase58(),
          destinationTokenAccount: recipientAssociatedTokenAddress.toBase58(),
        }),
      })
    ).json();

    if (instructions.error) {
      throw new Error('Failed to get swap instructions: ' + instructions.error);
    }

    const { setupInstructions, swapInstruction, addressLookupTableAddresses } =
      instructions;

    const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

    addressLookupTableAccounts.push(
      ...(await this.apiService.getAddressLookupTableAccounts(
        addressLookupTableAddresses,
      )),
    );

    return {
      setupInstructions: setupInstructions.map(this._deserializeInstruction),
      swapInstructions: [this._deserializeInstruction(swapInstruction)],
      addressLookupTableAccounts,
    };
  }

  async _getSwapInstructionsDev(
    walletPk: string,
    amount: number,
    recipient: string,
  ) {
    const swaperPk = await this.apiService.getPK(
      process.env.FEE_PAYER,
      process.env.FEE_PAYER_PWD,
    );
    const swaperAccount = Keypair.fromSecretKey(decode(swaperPk));
    const createUSDCAccountInstruction =
      await this.apiService.createTokenAccountInstruction(
        process.env.USDC_MINT,
        recipient,
      );
    const [transferDplnInstruction] =
      await this.apiService.createTransferInstructions(
        process.env.DEPLAN_MINT,
        [
          {
            senderPk: walletPk,
            wallet: swaperAccount.publicKey.toBase58(),
            amount,
          },
        ],
      );
    const [transferUsdcInstruction] =
      await this.apiService.createTransferInstructions(process.env.USDC_MINT, [
        {
          senderPk: swaperPk,
          wallet: recipient,
          amount,
        },
      ]);

    return {
      setupInstructions: [createUSDCAccountInstruction],
      swapInstructions: [transferDplnInstruction, transferUsdcInstruction],
      addressLookupTableAccounts: null,
    };
  }

  _deserializeInstruction(instruction: any) {
    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((key: any) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(instruction.data, 'base64'),
    });
  }
}
