import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export enum OfferStatusDto {
  accepted = 'accepted',
  declined = 'declined',
}

export class OfferStatusBodyDto {
  @ApiProperty({ enum: Object.values(OfferStatusDto) })
  @IsNotEmpty()
    status: OfferStatusDto;

  @ApiProperty({ example: 'ID', description: 'ID of the accepting/declining user' })
  @IsNotEmpty()
    userId: string;
}