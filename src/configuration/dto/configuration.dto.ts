import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { Config } from '../schema/config.schema';

export class ConfigurationDto {

  @ApiProperty({ example: 'Lite', description: 'Current application version. ("Lite" or "Pro")', required: true })
  mode: string;

}