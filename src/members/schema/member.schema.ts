import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { UserDocument } from '../../users/schema/user.schema';
import { Role } from '../enum/roles.enum';
import { EquityType } from '../enum/equity-type.enum';
import { CompensationType } from '../enum/compensation-type.enum';
import { PeriodType } from '../enum/period-type.enum';

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

export const InvestorSettingsSchema =
  SchemaFactory.createForClass(InvestorSettings);

@Schema({ _id: false })
export class Period {
  @ApiProperty({ example: 10 })
  @Prop({ type: Number, required: true })
  value: number;

  @ApiProperty({ example: 'Years', enum: Object.keys(PeriodType) })
  @Prop({ enum: Object.keys(PeriodType), required: true })
  timeframe: PeriodType;
}

export const PeriodSchema = SchemaFactory.createForClass(Period);

@Schema({ _id: false })
export class Equity {
  @ApiProperty({ example: 50 })
  @Prop({ type: Number, required: true, max: 100, min: 0 })
  amount: number;

  @ApiProperty({ example: 'Immediately' })
  @Prop({ enum: Object.keys(EquityType), required: true })
  type: EquityType;

  @ApiProperty({ example: 'Years' })
  @Prop({
    required: function () {
      return this.type === EquityType.DuringPeriod;
    },
    type: PeriodSchema,
  })
  period?: Period;
}

export const EquitySchema = SchemaFactory.createForClass(Equity);

@Schema({ _id: false })
export class Compensation {
  @ApiProperty({ example: 3000 })
  @Prop({ type: Number, required: true })
  amount: number;

  @ApiProperty({ example: 'PerMonth' })
  @Prop({ enum: Object.keys(CompensationType), required: true })
  type: CompensationType;

  @ApiProperty({ example: 'Year' })
  @Prop({
    required: function () {
      return this.type === CompensationType.OneTime;
    },
    type: PeriodSchema,
  })
  period?: Period;
}

export const CompensationSchema = SchemaFactory.createForClass(Compensation);

@Schema({ timestamps: true })
export class Member {
  @ApiProperty({ example: 'CEO' })
  @Prop({
    required: function () {
      return this.role !== Role.Investor;
    },
  })
  occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
  @Prop({ enum: Object.keys(Role), required: true })
  role: string;

  @ApiProperty({ example: 1 })
  @Prop({ default: 1 })
  impactRatio: number;

  @ApiProperty({ type: Equity, description: 'Equity settings' })
  @Prop({ type: EquitySchema })
  equity?: Equity;

  @ApiProperty({ type: Compensation, description: 'Compensation settings' })
  @Prop({ type: CompensationSchema })
  compensation?: Compensation;

  @ApiProperty({ example: false })
  @Prop({ default: false })
  isAutoContributing: boolean;

  @ApiProperty({ example: 40, default: 40 })
  @Prop({ type: Number, default: 40, max: 112 })
  hoursPerWeek: number;

  @Prop()
  agreement: string;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  user: string | UserDocument;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org' })
  orgUser: string | OrgDocument;

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
  @Prop({
    required: function () {
      return this.role === Role.Investor;
    },
    type: InvestorSettingsSchema,
  })
  investorSettings: InvestorSettings;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
  profit: number;
}

export const MemberSchema = SchemaFactory.createForClass(Member);

MemberSchema.index({ user: 1, org: 1, orgUser: 1 }, { unique: true });
