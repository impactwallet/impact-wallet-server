import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Role } from '../../members/enum/roles.enum';
import {
  Compensation,
  CompensationSchema,
  InvestorSettingsSchema as MemberInvestorSettingsSchema,
  InvestorSettings as MemberInvestorSettings,
  PeriodSchema,
  Period,
} from '../../members/schema/member.schema';
import { Org } from '../../orgs/schema/org.schema';
import { OfferStatus } from '../enum/statuses.enum';
import { OfferType } from '../enum/offer-type.enum';
import { Min } from 'class-validator';
import Bigjs from 'big.js';
import { bigJsToNumber, decimal128ToNumber } from '../../utils/bigjs';
import { EquityType } from '../../members/enum/equity-type.enum';

export type OfferDocument = HydratedDocument<Offer>;
export type MemberProspectDocument = HydratedDocument<MemberProspect>;

@Schema({ _id: false, toJSON: { getters: true }, toObject: { getters: true } })
export class MemberProspect {
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

  @ApiProperty({ type: Number, description: 'Equity amount' })
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    max: 100,
    min: 0,
    get: decimal128ToNumber,
    set: bigJsToNumber,
  })
  equityAmount: Bigjs | number;

  @ApiProperty({ example: 'Immediately' })
  @Prop({ enum: Object.keys(EquityType), required: true })
  equityType: EquityType;

  @ApiProperty({ example: 'Years' })
  @Prop({
    required: function () {
      return this.equityType === EquityType.DuringPeriod;
    },
    type: PeriodSchema,
  })
  equityPeriod?: Period;

  @ApiProperty({ description: 'Compensation settings' })
  @Prop({ type: CompensationSchema })
  compensation?: Compensation;

  @ApiProperty({ example: false, default: false })
  @Prop({ default: false })
  isAutoContributing: boolean;

  @ApiProperty({ example: 40, default: 40 })
  @Prop({ type: Number, default: 40, max: 112 })
  hoursPerWeek: number;

  @Prop()
  agreement: string;

  @ApiProperty({ description: 'Future investor settings' })
  @Prop({
    type: MemberInvestorSettingsSchema,
    required: function () {
      return this.role === Role.Investor;
    },
  })
  investorSettings: MemberInvestorSettings;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  org: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  user: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  orgUser: string;
}

export const MemberProspectSchema =
  SchemaFactory.createForClass(MemberProspect);

@Schema({ _id: false, toJSON: { getters: true }, toObject: { getters: true } })
export class InvestorSettings {
  @ApiProperty({ example: 100, description: 'Amount', type: Number })
  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  @ApiProperty({ example: 10, description: 'Equity', type: Number })
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: decimal128ToNumber,
    set: bigJsToNumber,
  })
  equity: Bigjs | number;

  @ApiProperty({
    example: 1,
    description: 'Minimal Investment',
    type: Number,
    default: 1,
  })
  @Min(1, { message: 'Minimal investment must be at least 1' })
  @Prop({ type: Number, required: true, min: 1, default: 1 })
  minimalInvestment: number;
}

export const InvestorSettingsSchema =
  SchemaFactory.createForClass(InvestorSettings);

@Schema({ timestamps: true })
export class Offer {
  @ApiProperty({
    example: 'Approved',
    description: 'Offer status',
    enum: Object.values(OfferStatus),
  })
  @Prop({ enum: Object.values(OfferStatus), default: OfferStatus.Pending })
  status: OfferStatus;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
  org: string | Org;

  @ApiProperty({ description: 'Member to create', type: [MemberProspect] })
  @Prop({ type: [MemberProspectSchema], required: false })
  memberProspects: MemberProspectDocument[];

  @ApiProperty({
    example: 'Investor',
    description: 'Offer type',
    enum: Object.values(OfferType),
  })
  @Prop({ enum: Object.values(OfferType), default: OfferType.Regular })
  type: OfferType;

  @ApiProperty({
    type: InvestorSettings,
    description: 'Investor setting',
    required: false,
  })
  @Prop({
    type: InvestorSettingsSchema,
    required: function () {
      return this.type === OfferType.Investor;
    },
  })
  investorSettings: InvestorSettings;
}

export const OfferSchema = SchemaFactory.createForClass(Offer);
