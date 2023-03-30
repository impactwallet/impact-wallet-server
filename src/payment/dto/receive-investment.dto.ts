import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class ReceiveInvestmentDto {
  @ApiProperty({ example: 'Investing $10 for 5% of equity allocation' })
  @IsNotEmpty()
  @IsString()
    info: string;

  @ApiProperty({ example: 10, description: 'Investment amount' })
  @IsNotEmpty()
  @IsNumber()
    amount: number;
}