import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class TransactionHistoryPaginationDto {
  @ApiProperty({
    example: '2af8318b-410f-43b8-a3d6-98604ef5fc95',
    description:
      'Start searching backwards from this transaction signature. Remark: If not provided the search starts from the highest max confirmed block.',
  })
  @IsOptional()
  @IsString()
  before?: string;

  @ApiProperty({
    example: 'ff2dc84d-e620-4c4b-a386-577ba37954e5',
    description: `Search until this transaction signature is reached, if found before 'limit'.`,
  })
  @IsOptional()
  @IsString()
  until?: string;

  @ApiProperty({
    example: 10,
    description: `Maximum transaction signatures to return (between 1 and 1,000, default: 1,000).`,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  limit: number = 10;

  @ApiProperty({
    example: 5,
    description: `The minimum slot that the request can be evaluated at.`,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  minContextSlot?: number;
}
