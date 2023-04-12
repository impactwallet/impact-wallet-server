import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { UserDocument } from '../../users/schema/user.schema';
import { Role } from '../enum/roles.enum';

export type MemberDocument = HydratedDocument<Member>;
export type InvestorSettingsDocument = HydratedDocument<InvestorSettings>;

@Schema({ _id: false })
export class InvestorSettings {
  @ApiProperty({ description: 'Investment amount', type: Number })
  @Prop({ type: Number, required: true })
    investmentAmount: number;

  @ApiProperty({ description: 'Equity allocation', type: Number })
  @Prop({ type: Number, required: true })
    equityAllocation: number;
}

export const InvestorSettingsSchema = SchemaFactory.createForClass(InvestorSettings);

@Schema({ timestamps: true })
export class Member {

  @ApiProperty({ example: 'CEO' })
  @Prop({ required: function() { return this.role !== Role.Investor; } })
    occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
  @Prop({ enum: Object.keys(Role), required: true })
    role: string;

  @ApiProperty({ example: 1 })
  @Prop({ default: 1 })
    impactRatio: number;

  @ApiProperty({ example: false })
  @Prop({ default: false })
    isMonthlyCompensated: boolean;

  @ApiProperty({ example: 3000 })
  @Prop({ type: Number })
    monthlyCompensation: number;

  @ApiProperty({ example: false })
  @Prop({ default: false })
    isAutoContributing: boolean;

  @ApiProperty({ example: 40, default: 40 })
  @Prop({ type: Number, default: 40, max: 112 })
    hoursPerWeek: number;

  @Prop()
    agreement: string;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
    user: string | UserDocument;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    org: string | OrgDocument;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
    contributed: number;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
    lamportsEarned: number;

  @ApiProperty({ description: 'Investor settings' })
  @Prop({ required: function() { return this.role === Role.Investor; }, type: InvestorSettingsSchema })
    investorSettings: InvestorSettings;

}

export const MemberSchema = SchemaFactory.createForClass(Member);

MemberSchema.index({ user: 1, org: 1 }, { unique: true });