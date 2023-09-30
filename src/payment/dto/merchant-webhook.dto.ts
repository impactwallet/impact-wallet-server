import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsString } from 'class-validator';

export class MerchantWebhookDto {
  @ApiProperty({ description: 'Wallet address of the organization' })
  @IsString()
  walletAddress: string;

  @IsNumberString()
  @ApiProperty({ description: 'Payment amount' })
  amount: string;
}
