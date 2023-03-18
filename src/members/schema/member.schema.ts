import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { Org } from '../../orgs/schema/org.schema';
import { User } from '../../users/schema/user.schema';
import { Role } from '../enum/roles.enum';

export type MemberDocument = HydratedDocument<Member>;

@Schema()
export class Member {

  @ApiProperty({ example: 'CEO' })
  @Prop({ required: true })
    occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
  @Prop({ enum: Object.keys(Role), required: true })
    role: string;

  @ApiProperty({ example: 1 })
  @Prop({ default: 1 })
    impactRatio: number;

  @ApiProperty({ example: false })
  @Prop()
    isMonthlyCompensated: boolean;

  @ApiProperty({ example: 3000 })
  @Prop()
    monthlyCompensation: number;

  @ApiProperty({ example: true })
  @Prop({ default: true })
    autoContribution: boolean;

  @Prop()
    agreement: string;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
    user: string | User;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    org: string | Org;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
    contributed: number;

}

export const MemberSchema = SchemaFactory.createForClass(Member);

MemberSchema.index({ user: 1, org: 1 }, { unique: true });