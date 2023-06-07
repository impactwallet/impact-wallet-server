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

  @ApiProperty({ example: 100, description: 'Amount', type: Number, required: false })
  amount: number;

}