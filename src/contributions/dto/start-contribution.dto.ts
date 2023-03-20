import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class StartContributionDto {
  @ApiProperty({ example: 'ID' })
  @IsNotEmpty()
    memberId: string;
}