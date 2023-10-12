import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class MerchantWebhookDto {
  @ApiProperty({ description: 'Wallet address of the organization' })
  @IsString()
  walletAddress: string;

  @IsNumberString()
  @ApiProperty({ description: 'Payment amount' })
  amount: string;

  @ApiProperty({ description: 'Memo of the transaction' })
  @IsString()
  @IsOptional()
  memo: string;
}
