import { ApiProperty } from '@nestjs/swagger';
import { EquityType } from '../enum/equity-type.enum';
import { PeriodType } from '../enum/period-type.enum';

export class EquityDto {
  @ApiProperty({ example: 3000 })
    amount: number;

  @ApiProperty({ example: 'Immediately', enum: Object.keys(EquityType) })
    type: EquityType;

  @ApiProperty({ example: 'Years', enum: Object.keys(PeriodType) })
    period?: PeriodType;

}