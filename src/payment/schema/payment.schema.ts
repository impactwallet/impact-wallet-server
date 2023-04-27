
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { MemberProspectDocument, MemberProspectSchema } from '../../offers/schema/offer.schema';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { PaymentType } from '../enum/payment-type.enum';
import { SaleOfferDocument, SaleOfferSchema } from '../../offers/schema/sale-offer.schema';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {

  @ApiProperty({ description: 'Payment type', enum: Object.values(PaymentType) })
  @Prop({ type: String, enum: Object.values(PaymentType), default: PaymentType.Regular })
    type: PaymentType;

  @ApiProperty({ description: 'Investor member object' })
  @Prop({ type: MemberProspectSchema, required: function() { return this.type === PaymentType.Investment; } })
    investor: MemberProspectDocument;

  @ApiProperty({ description: 'Sale parameters' })
  @Prop({ type: SaleOfferSchema, required: function() { return this.type === PaymentType.AssetsSell; } })
    sale: SaleOfferDocument;

  @ApiProperty({ example: 'ID or object', description: 'Org id or object' })
  @Prop({ required: function() { return this.type !== PaymentType.AssetsSell; }, type: mongoose.Schema.Types.ObjectId, ref: 'Org' })
    org: string | OrgDocument;

  @ApiProperty({ example: '10', description: 'Amount of payment in USD' })
  @Prop({ type: Number, required: true })
    amount: number;

  @ApiProperty({ example: 'ID', description: 'CandyPay session id' })
  @Prop({ type: String })
    cpSessionId: string;

  @ApiProperty({ example: 'ID', description: 'CandyPay order id' })
  @Prop({ type: String })
    cpOrderId: string;

  @ApiProperty({ example: 'URL', description: 'CandyPay payment url' })
  @Prop({ type: String })
    cpPaymentUrl: string;

  @Prop({ type: mongoose.Schema.Types.Mixed })
    cpResult: any;

  @ApiProperty({ description: 'Transaction hash for in-app payments' })
  @Prop({ type: String })
    txnHash: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);