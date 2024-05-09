import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';

export enum CreditsWithdrawToken {
  DPLN = 'DPLN',
  USDC = 'USDC',
}

export class CreditsWithdrawDto {
  @ApiProperty({ description: 'Recipient wallet' })
  recipient: string;

  @ApiProperty({ description: 'Amount of Credit$' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Token of the withdrawal' })
  @IsString()
  @IsEnum(CreditsWithdrawToken)
  token: CreditsWithdrawToken;
}
