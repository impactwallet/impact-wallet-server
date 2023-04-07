import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString } from 'class-validator';

export class SellAssetsDto {
  @ApiProperty({ example: '10', description: 'Amount of payment in USD' })
  @IsNumber()
  @IsPositive()
    price: number;

  @ApiProperty({ example: 'Some info', description: 'Additional info' })
  @IsString()
    info: string;
}