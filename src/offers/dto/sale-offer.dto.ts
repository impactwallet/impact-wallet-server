import { ApiProperty } from '@nestjs/swagger';

export class SaleOfferDto {

  @ApiProperty({ description: 'Offer tokens amount' })
    tokensAmount: number;

  @ApiProperty({ description: 'Offer price' })
    price: number;

  @ApiProperty({ description: 'ID of the seller' })
    userId: string;

  @ApiProperty({ description: 'ID of the org/asset' })
    orgId: string;
}