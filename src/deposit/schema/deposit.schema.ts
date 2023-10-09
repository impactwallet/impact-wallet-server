import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { UserDocument } from '../../users/schema/user.schema';
import { DepositStatus } from '../enum/deposit-status.enum';

export type DepositDocument = HydratedDocument<Deposit>;

@Schema({ timestamps: true })
export class Deposit {
  @ApiProperty({ description: 'Deposit amount' })
  @Prop({ required: true, type: Number })
  amount: number;

  @ApiProperty({ description: 'Org user ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org' })
  orgUser: string | OrgDocument;

  @ApiProperty({ description: 'User ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  user: string | UserDocument;

  @ApiProperty({ description: 'Status of the deposit' })
  @Prop({
    required: true,
    default: DepositStatus.Pending,
    enum: Object.values(DepositStatus),
  })
  status: DepositStatus;

  @ApiProperty({ description: 'Txn hash' })
  @Prop({ type: String })
  txnHash: string;

  @ApiProperty({ description: 'Deposit error message' })
  @Prop({ type: String })
  error: string;
}

export const DepositSchema = SchemaFactory.createForClass(Deposit);
