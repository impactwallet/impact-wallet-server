import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';
import { TypeTransaction } from '../enum/type-transaction.enum';

export type AirdropDocument = HydratedDocument<Airdrop>;

@Schema({ timestamps: true })
export class Airdrop {
  @ApiProperty({ description: 'Transaction date in epoch' })
  @Prop({ type: Number })
  transactionDate: number;

  @ApiProperty({ description: 'Holder wallet' })
  @Prop({ type: String })
  wallet: string;

  @ApiProperty({ description: 'Amount of transaction' })
  @Prop({ type: Number })
  amount: number;

  @ApiProperty({ description: 'Final amount for the wallet' })
  @Prop({ type: Number })
  finalAmount: number;

  @ApiProperty({ description: 'Number of days tokens were held' })
  @Prop({ type: Number })
  holderOfDays: number;

  @ApiProperty({ description: 'Type of transaction' })
  @Prop({
    required: true,
    default: TypeTransaction.UNKNOWN,
    enum: Object.values(TypeTransaction),
  })
  typeTransaction: TypeTransaction;

  @ApiProperty({ description: 'Current balance' })
  @Prop({ type: Number })
  currentBalance: number;

  @ApiProperty({ description: 'Check balance' })
  @Prop({ type: Number })
  balanceCheck: number;

  @ApiProperty({ description: 'Transaction' })
  @Prop({ type: String })
  transaction: string;

  @ApiProperty({ description: 'Error' })
  @Prop({ type: String })
  error: string;

  @ApiProperty({ description: 'Claim percent for the wallet' })
  @Prop({ type: Number })
  claimPercent: number;

  @ApiProperty({ description: 'Claim amount for the wallet' })
  @Prop({ type: Number })
  claimAmount: number;

  @ApiProperty({ description: 'Transaction hash' })
  @Prop({ type: String })
  txnHash: string;

  @ApiProperty({ description: 'Transaction error' })
  @Prop({ type: String })
  txnError: string;

  @ApiProperty({ description: 'Has the holder received a claim' })
  @Prop({ default: false, type: Boolean })
  isClaim: boolean;
}

export const AirdropSchema = SchemaFactory.createForClass(Airdrop);
