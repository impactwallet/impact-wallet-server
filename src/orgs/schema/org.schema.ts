import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type OrgDocument = HydratedDocument<Org>;

@Schema()
export class OrgSettings {
  @ApiProperty({
    example: '30',
    description: 'Reserved for organization needs',
  })
  @Prop({ default: 0 })
  treasury: number;

  @ApiProperty({
    example: 'https://org.com/webhook',
    description: 'Org payment webhook',
  })
  @Prop()
  webhook: string;

  @ApiProperty({
    example: 'https://org.com/success',
    description: 'Org payment success url',
  })
  @Prop()
  successUrl: string;

  @ApiProperty({
    example: 'https://org.com/cancel',
    description: 'Org payment cancel url',
  })
  @Prop()
  cancelUrl: string;

  @ApiProperty({ description: 'Specifies if the org is content based' })
  @Prop({ default: false })
  isContent: boolean;

  @ApiProperty({ description: 'Specifies if the org is an app' })
  @Prop({ default: false })
  isApp: boolean;

  @ApiProperty({ description: 'Price per month for app usage' })
  @Prop({
    required: function () {
      return this.isApp;
    },
  })
  pricePerMonth: number;

  @ApiProperty({ description: 'App url' })
  @Prop({ type: String })
  appUrl: string;
}

export const OrgSettingsSchema = SchemaFactory.createForClass(OrgSettings);

@Schema({ timestamps: true })
export class Org {
  @ApiProperty({
    example: 'impact_wallet',
    description: 'Unique username of organization',
  })
  @Prop({ unique: true, required: true, set: (v = '') => v.trim() })
  username: string;

  @ApiProperty({
    example: 'Impact-Wallet',
    description: 'Name of organizations',
  })
  @Prop({ required: true, set: (v = '') => v.trim() })
  name: string;

  @ApiProperty({
    example: 'Turn your time into equity',
    description: 'Information about the organization',
  })
  @Prop()
  description: string;

  @ApiProperty({
    example: 'https://impact-wallet.com',
    description: 'Organization link',
  })
  @Prop()
  link: string;

  @ApiProperty({ example: 'jpg, png', description: 'Logo organization' })
  @Prop({ required: true })
  logo: string;

  @ApiProperty({
    example: '6ZMDvWkKG9v7GhoTjCPd9FyVCQ36YVxxsB7W57At9ShD',
    description: 'Organization wallet',
  })
  @Prop()
  wallet: string;

  @Prop()
  mint: string;

  @Prop()
  mintError: string;

  @Prop()
  mintStatus: string;

  @ApiProperty({
    example: 'msLadpoohjKhd621CPd9FyVCQ36YVsxxsB7W57At9ShM',
    description: 'Organization token',
  })
  @Prop()
  token: string;

  @Prop({ select: false })
  password: string;

  @Prop({ _id: false, type: OrgSettingsSchema, default: new OrgSettings() })
  settings: OrgSettings;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
  lamportsMinted: number;

  @Prop({ type: String })
  stripeProductId: string;

  @Prop({ type: String })
  stripePriceId: string;
}

export const OrgSchema = SchemaFactory.createForClass(Org);
