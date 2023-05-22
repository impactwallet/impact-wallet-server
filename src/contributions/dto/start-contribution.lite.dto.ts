import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class StartContributionLiteDto {
  @ApiProperty({ example: 'Memo' })
  @IsString()
  @IsNotEmpty()
    memo: string;
}