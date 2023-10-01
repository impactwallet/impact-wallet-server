import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class CreditsWithdrawDto {
  @ApiProperty({ description: 'Recipient wallet' })
  recipient: string;

  @ApiProperty({ description: 'Amount of Credit$' })
  @IsNumber()
  amount: number;
}
