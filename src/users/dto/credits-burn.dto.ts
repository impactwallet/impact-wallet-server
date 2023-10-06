import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class CreditsBurnDto {
  @ApiProperty({ description: 'Amount of Credit$' })
  @IsNumber()
  amount: number;
}
