import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument, Model } from 'mongoose';
import { UserDocument } from '../../users/schema/user.schema';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { OfferStatus } from '../enum/statuses.enum';
import { get, isNil } from 'lodash';

export type SaleOfferDocument = HydratedDocument<SaleOffer>;
export type DocumentWithSale = mongoose.Document & { sale: SaleOfferDocument };

@Schema({ timestamps: true })
export class SaleOffer {
  @ApiProperty({
    example: 'Approved',
    description: 'Offer status',
    enum: Object.values(OfferStatus),
  })
  @Prop({ enum: Object.values(OfferStatus), default: OfferStatus.Pending })
  status: OfferStatus;

  @ApiProperty({ description: 'Amount of tokens to sell' })
  @Prop({ required: true, type: Number })
  tokensAmount: number;

  @ApiProperty({ description: 'Sell price' })
  @Prop({ required: true, type: Number })
  price: number;

  @ApiProperty({ example: 'ID or object', description: 'The seller' })
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId })
  seller: mongoose.Types.ObjectId | UserDocument | OrgDocument;

  @ApiProperty({ example: 'ID or object', description: 'Org owning the token' })
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Org' })
  org: mongoose.Types.ObjectId | OrgDocument;

  @ApiProperty({
    example: 'ID or object',
    description: 'The buyer - user or org',
    required: false,
  })
  @Prop({
    required: function () {
      return this.status === OfferStatus.Approved;
    },
    type: mongoose.Schema.Types.ObjectId,
  })
  buyer?: mongoose.Types.ObjectId | UserDocument | OrgDocument;

  @ApiProperty({ example: 'Transaction signature' })
  @Prop({ type: String })
  txnHash: string;

  @ApiProperty()
  @Prop({ type: Boolean, default: false })
  isLifeTime: boolean;

  populateSeller: (projection?: string) => Promise<void>;
  populateBuyer: (projection?: string) => Promise<void>;
}

export const SaleOfferSchema = SchemaFactory.createForClass(SaleOffer);

SaleOfferSchema.methods.populateSeller = async function (projection?: string) {
  const sellerId = get(this, 'seller._id', this.seller);
  await this.populate({ path: 'seller', model: 'User', select: projection });
  if (isNil(this.seller)) {
    this.seller = sellerId;
    await this.populate({ path: 'seller', model: 'Org', select: projection });
  }
};

SaleOfferSchema.methods.populateBuyer = async function (projection?: string) {
  const buyerId = get(this, 'buyer._id', this.buyer);
  await this.populate({ path: 'buyer', model: 'User', select: projection });
  if (isNil(this.buyer)) {
    this.buyer = buyerId;
    await this.populate({ path: 'buyer', model: 'Org', select: projection });
  }
};

interface SaleOfferStatics {
  populateSeller: (doc: DocumentWithSale) => Promise<void>;
  populateBuyer: (doc: DocumentWithSale) => Promise<void>;
}

export type SaleOfferModel = Model<SaleOfferDocument> & SaleOfferStatics;

SaleOfferSchema.statics.populateSeller = async function (
  doc: DocumentWithSale,
) {
  const sellerId = get(doc.sale, 'seller._id', doc.sale.seller);
  await doc.populate({ path: 'sale.seller', model: 'User' });
  if (isNil(doc.sale.seller)) {
    doc.sale.seller = sellerId;
    await doc.populate({ path: 'sale.seller', model: 'Org' });
  }
};

SaleOfferSchema.statics.populateBuyer = async function (doc: DocumentWithSale) {
  const buyerId = get(doc.sale, 'buyer._id', doc.sale.buyer);
  await doc.populate({ path: 'sale.buyer', model: 'User' });
  if (isNil(doc.sale.buyer)) {
    doc.sale.buyer = buyerId;
    await doc.populate({ path: 'sale.buyer', model: 'Org' });
  }
};
