import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StopContributionDto {
  @ApiProperty({ required: false, description: 'Memo' })
  @IsString()
  @IsOptional()
    memo?: string;
}