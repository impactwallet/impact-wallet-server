import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from '../enum/roles.enum';

export type MemberDocument = HydratedDocument<Member>;

@Schema()
export class Member {

  @Prop({ required: true })
    occupation: string;

  @Prop({ enum: Object.keys(Role), required: true })
    role: string;

  @Prop({ default: 1 })
    impactRatio: number;

  @Prop()
    isMonthlyCompensated: boolean;

  @Prop()
    monthlyCompensation: number;

  @Prop({ default: true })
    autoContribution: boolean;

  @Prop()
    agreement: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
    userId: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    orgId: string;

}

export const MemberSchema = SchemaFactory.createForClass(Member);

MemberSchema.index({ userId: 1, orgId: 1 }, { unique: true });