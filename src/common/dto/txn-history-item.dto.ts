import { ApiProperty } from '@nestjs/swagger';

export class TxnHistoryItemDto {
  @ApiProperty({ type: 'number', description: 'The unix timestamp of when the transaction was processed' })
    processedAt?: number;
  @ApiProperty({ type: 'string', description: 'Address or entity username' })
    addressOrUsername?: string;
  @ApiProperty({ type: 'string', description: 'Entity image' })
    img?: string;
  @ApiProperty({ type: 'number', description: 'Transaction amount' })
    amount?: number;
  @ApiProperty({ type: 'string', description: 'Transaction description' })
    description?: string;
}