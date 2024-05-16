import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SocialName } from '../enum/social-name.enum';

export type WalletSocialDocument = HydratedDocument<WalletSocial>;

@Schema({ timestamps: true })
export class WalletSocial {
  @Prop({ type: String, required: true })
  wallet: string;

  @Prop({ type: String, required: true })
  socialUserId: string;

  @Prop({ type: String })
  socialUserName: string;

  @Prop({ type: String, enum: Object.values(SocialName) })
  socialName: SocialName;

  @Prop({ type: Boolean, default: false })
  isFollowing: boolean;
}

export const WalletSocialSchema = SchemaFactory.createForClass(WalletSocial);
