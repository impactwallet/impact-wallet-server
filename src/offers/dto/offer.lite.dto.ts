import { ApiProperty } from '@nestjs/swagger';
import { OfferType } from '../enum/offer-type.enum';

export class InvestorSettings {
  @ApiProperty({ example: 100, description: 'Amount', type: Number })
  amount: number;

  @ApiProperty({ example: 10, description: 'Equity', type: Number })
  equity: number;
}

export class OfferLiteDto {
  org: string;

  @ApiProperty({ example: 'Investor', description: 'Offer type', enum: Object.values(OfferType) })
  type: OfferType;
  
  @ApiProperty({ description: 'Future investor settings' })
  investorSettings: InvestorSettings;
}