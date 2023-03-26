
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { OrgDocument } from '../../orgs/schema/org.schema';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {

  @ApiProperty({ example: 'ID or object', description: 'Org id or object' })
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Org' })
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

}

export const PaymentSchema = SchemaFactory.createForClass(Payment);