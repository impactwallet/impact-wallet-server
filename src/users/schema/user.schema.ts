import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @ApiProperty({ example: 'Dmitry', description: 'Nickname of user' })
  @Prop({ required: true, unique: true, set: (value = '') => value.trim() })
  nickname: string;

  @ApiProperty({ example: 'Dmitry Vitko', description: 'Name of user' })
  @Prop({ set: (value = '') => value.trim() })
  name: string;

  @ApiProperty({ example: 'jpg, png', description: 'Photo user profile' })
  @Prop()
  avatar: string;

  @ApiProperty({
    example: '6ZMDvWkKG9v7GhoTjCPd9FyVCQ36YVxxsB7W57At9ShD',
    description: 'User wallet',
  })
  @Prop()
  wallet: string;

  @ApiProperty({
    example: 'bc1qfg9t7fwn0atn4yf9spca5502vk8dyhq8a9aqd8',
    description: 'User bonus wallet',
  })
  @Prop()
  bonusWallet: string;

  @Prop({ select: false })
  password: string;

  @Prop({ select: false })
  secretLink: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
