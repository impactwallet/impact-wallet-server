import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { Member } from '../../members/schema/member.schema';
import { Org } from '../../orgs/schema/org.schema';

export type ContributionDocument = HydratedDocument<Contribution>;

@Schema({ timestamps: true })
export class Contribution {
  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true })
    member: string | Member;

  @ApiProperty({ example: 'ID or object' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true })
    org: string | Org;

  @ApiProperty({ example: '1.5', required: true })
  @Prop({ type: Number })
    impactRatio: number;

  @ApiProperty({ example: '2023-03-20T15:43:10.898+00:00' })
  @Prop({ type: String, default: null })
    stoppedAt: string;

  @ApiProperty({ example: 'base64 string' })
  @Prop({ type: String })
    transactionHash: string;
}

export const ContributionSchema = SchemaFactory.createForClass(Contribution);