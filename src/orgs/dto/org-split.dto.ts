import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNumberString } from 'class-validator';

export class OrgSplitDto {
  @ApiProperty({ description: 'Amount to split' })
  @IsNumberString()
  amount: number;
}
