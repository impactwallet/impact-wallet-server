import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from '../../members/enum/roles.enum';
import { InvestorSettings } from '../../members/schema/member.schema';
import { Org } from '../../orgs/schema/org.schema';
import { OfferStatus } from '../enum/statuses.enum';

export type OfferDocument = HydratedDocument<Offer>;
export type MemberProspectDocument = HydratedDocument<MemberProspect>;

@Schema({ _id: false })
export class MemberProspect {

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
  @Prop()
    monthlyCompensation: number;

  @ApiProperty({ example: true })
  @Prop({ default: true })
    autoContribution: boolean;

  @Prop()
    agreement: string;

  @ApiProperty({ description: 'Future nvestor settings' })
  @Prop({ required: function() { return this.role === Role.Investor; } })
    investorSettings: InvestorSettings;

}

export const MemberProspectSchema = SchemaFactory.createForClass(MemberProspect);

@Schema({ timestamps: true })
export class Offer {

  @ApiProperty({ example: 'Approved', description: 'Offer status', enum: Object.values(OfferStatus) })
  @Prop({ enum: Object.values(OfferStatus), default: OfferStatus.Pending })
    status: OfferStatus;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    org: string | Org;

  @ApiProperty({ description: 'Member to create', type: MemberProspect })
  @Prop({ type: MemberProspectSchema, required: true })
    memberProspect: MemberProspectDocument;

}

export const OfferSchema = SchemaFactory.createForClass(Offer);