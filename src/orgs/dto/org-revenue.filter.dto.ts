import { IsEnum, IsOptional } from 'class-validator';
import { RevenuePeriod } from '../enum/revenue-period';
import { ApiProperty } from '@nestjs/swagger';

export class OrgRevenueFilterDto {
  @ApiProperty({ enum: RevenuePeriod, default: RevenuePeriod.Monthly })
  @IsOptional()
  @IsEnum(RevenuePeriod)
  period: RevenuePeriod = RevenuePeriod.Monthly;
}
