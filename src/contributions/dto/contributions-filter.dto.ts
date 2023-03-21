import { ApiProperty } from '@nestjs/swagger';
import { IsBooleanString, IsMongoId, IsOptional } from 'class-validator';

export class ContributionsFilterDto {
  @ApiProperty({ description: 'Filter by stopped property', required: false, type: Boolean })
  @IsOptional()
  @IsBooleanString()
    isStopped: string;

  @IsOptional()
  @IsMongoId()
    userId: string;

  @ApiProperty({ description: 'Filter by org ID', required: false, type: String })
  @IsOptional()
  @IsMongoId()
    orgId: string;
}