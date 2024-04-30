import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserNonceDocument = HydratedDocument<UserNonce>;

@Schema({ timestamps: true })
export class UserNonce {
  @Prop({ required: true })
  wallet: string;

  @Prop({ required: true })
  nonce: string;
}

export const UserNonceSchema = SchemaFactory.createForClass(UserNonce);
