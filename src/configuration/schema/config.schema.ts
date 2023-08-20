import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type ConfigDocument = HydratedDocument<Config>;
@Schema({ versionKey: false })
export class Config {
  @Prop({ select: false, required: true, unique: true })
  id: number;

  @ApiProperty({
    example: 'Lite',
    description: 'Current application version. ("Lite" or "Pro")',
  })
  @Prop({ required: true })
  mode: string;

  @ApiProperty({ description: 'Bonus wallet expiration in minutes' })
  bonusWalletExpiration: number;
}

export const ConfigSchema = SchemaFactory.createForClass(Config);
