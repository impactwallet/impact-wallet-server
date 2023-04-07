import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { UserDocument } from '../../users/schema/user.schema';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { OfferStatus } from '../enum/statuses.enum';

export type SaleOfferDocument = HydratedDocument<SaleOffer>;

@Schema({ timestamps: true })
export class SaleOffer {
  @ApiProperty({ example: 'Approved', description: 'Offer status', enum: Object.values(OfferStatus) })
  @Prop({ enum: Object.values(OfferStatus), default: OfferStatus.Pending })
    status: OfferStatus;

  @ApiProperty({ description: 'Amount of tokens to sell' })
  @Prop({ required: true, type: Number })
    tokensAmount: number;

  @ApiProperty({ description: 'Sell price' })
  @Prop({ required: true, type: Number })
    price: number;

  @ApiProperty({ example: 'ID or object', description: 'The seller' })
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'User' })
    seller: mongoose.Types.ObjectId | UserDocument;

  @ApiProperty({ example: 'ID or object', description: 'Org owning the token' })
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Org' })
    org: mongoose.Types.ObjectId | OrgDocument;

  @ApiProperty({ example: 'ID or object', description: 'The buyer', required: false })
  @Prop({ required: function() { return this.status === OfferStatus.Approved; }, type: mongoose.Schema.Types.ObjectId, ref: 'User' })
    buyer?: mongoose.Types.ObjectId | UserDocument;
}

export const SaleOfferSchema = SchemaFactory.createForClass(SaleOffer);