import { ApiProperty } from '@nestjs/swagger';

export class InvestorSettingsDto {
  @ApiProperty({ description: 'Investment amount', type: Number })
    investmentAmount: number;

  @ApiProperty({ description: 'Equity allocation', type: Number })
    equityAllocation: number;
}