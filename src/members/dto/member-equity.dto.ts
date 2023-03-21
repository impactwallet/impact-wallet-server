import { ApiProperty } from '@nestjs/swagger';

export class MemberEquityDto {
  @ApiProperty({ description: 'Earned tokens amount' })
    lamportsEarned: number;

  @ApiProperty({ description: 'Equity in organisation' })
    equity: number;
}