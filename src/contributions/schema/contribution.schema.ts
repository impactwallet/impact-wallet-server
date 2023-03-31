import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { MemberDocument } from '../../members/schema/member.schema';
import { OrgDocument } from '../../orgs/schema/org.schema';

export type ContributionDocument = HydratedDocument<Contribution>;
export type ContributionSplitDocument = HydratedDocument<ContributionSplit>;

@Schema({ _id: false })
export class ContributionSplit {
  @ApiProperty({ description: 'Earned tokens', type: Number })
  @Prop({ type: Number, required: true })
    amount: number;

  @ApiProperty({ description: 'Member ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true })
    member: string | MemberDocument;

  @ApiProperty({ description: 'Wallet of the member' })
  @Prop({ type: String, required: true })
    wallet: string;
  
  @Prop({ type: Number })
    duration: number;
}

export const ContributionSplitSchema = SchemaFactory.createForClass(ContributionSplit);

@Schema({ timestamps: true })
export class Contribution {
  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true })
    member: string | MemberDocument;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    org: string | OrgDocument;

  @ApiProperty({ example: '1.5', required: true })
  @Prop({ type: Number })
    impactRatio: number;

  @ApiProperty({ example: '2023-03-20T15:43:10.898+00:00' })
  @Prop({ type: Date, default: null })
    stoppedAt: Date;

  @ApiProperty({ example: 'base64 string' })
  @Prop({ type: String })
    txnHash: string;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
    lamportsEarned: number;

  @ApiProperty({ description: 'Split between member and investors' })
  @Prop({ type: [ContributionSplitSchema] })
    split: ContributionSplit[];

  createdAt: Date;

  updatedAt: Date;
}

export const ContributionSchema = SchemaFactory.createForClass(Contribution);