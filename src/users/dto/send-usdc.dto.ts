import { ApiProperty } from '@nestjs/swagger';

export class SendUsdcDto {
  @ApiProperty({ description: 'Recipient wallet' })
  recipient: string;

  @ApiProperty({ description: 'Amount of Credit$' })
  amount: number;
}
