import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from '../../members/enum/roles.enum';
import { Compensation, CompensationSchema, Equity, EquitySchema, InvestorSettingsSchema as MemberInvestorSettingsSchema, InvestorSettings as MemberInvestorSettings } from '../../members/schema/member.schema';
import { Org } from '../../orgs/schema/org.schema';
import { OfferStatus } from '../enum/statuses.enum';
import { OfferType } from '../enum/offer-type.enum';

export type OfferDocument = HydratedDocument<Offer>;
export type MemberProspectDocument = HydratedDocument<MemberProspect>;

@Schema({ _id: false })
export class MemberProspect {

  @ApiProperty({ example: 'CEO' })
  @Prop({ required: function () { return this.role !== Role.Investor; } })
    occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
  @Prop({ enum: Object.keys(Role), required: true })
    role: string;

  @ApiProperty({ example: 1 })
  @Prop({ default: 1 })
    impactRatio: number;

  @ApiProperty({ description: 'Equity settings' })
  @Prop({ type: EquitySchema })
    equity?: Equity;

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
  @Prop({ type: MemberInvestorSettingsSchema, required: function () { return this.role === Role.Investor; } })
    investorSettings: MemberInvestorSettings;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
    org: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
    user: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
    orgUser: string;
}

export const MemberProspectSchema = SchemaFactory.createForClass(MemberProspect);

@Schema({ _id: false })
export class InvestorSettings {
  @ApiProperty({ example: 100, description: 'Amount', type: Number })
  @Prop({ type: Number, required: true })
    amount: number;

  @ApiProperty({ example: 10, description: 'Equity', type: Number })
  @Prop({ type: Number, required: true })
    equity: number;
}

export const InvestorSettingsSchema = SchemaFactory.createForClass(InvestorSettings);

@Schema({ timestamps: true })
export class Offer {

  @ApiProperty({ example: 'Approved', description: 'Offer status', enum: Object.values(OfferStatus) })
  @Prop({ enum: Object.values(OfferStatus), default: OfferStatus.Pending })
    status: OfferStatus;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    org: string | Org;

  @ApiProperty({ description: 'Member to create', type: [MemberProspect] })
  @Prop({ type: [MemberProspectSchema], required: false })
    memberProspects: MemberProspectDocument[];

  @ApiProperty({ example: 'Investor', description: 'Offer type', enum: Object.values(OfferType) })
  @Prop({ enum: Object.values(OfferType), default: OfferType.Regular })
    type: OfferType;

  @ApiProperty({ type: InvestorSettings, description: 'Investor setting', required: false })
  @Prop({ type: InvestorSettingsSchema, required: function () { return this.type === OfferType.Investor; } })
    investorSettings: InvestorSettings;
}

export const OfferSchema = SchemaFactory.createForClass(Offer);