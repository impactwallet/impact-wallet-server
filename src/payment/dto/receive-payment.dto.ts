import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class ReceivePaymentItemDto {
  @ApiProperty({ example: 'Service', description: 'Name of the item' })
  @IsNotEmpty()
  @IsString()
    name: string;

  @ApiProperty({ example: 10, description: 'Price for the item in USD' })
  @IsNotEmpty()
  @IsNumber()
    amount: number;

  @ApiProperty({ description: 'Image of the item' })
  @IsString()
    image: string;
}

export class ReceivePaymentDto {
  @ApiProperty({ example: 'Service', description: 'The items to receive a payment for' })
    items: ReceivePaymentItemDto[];
}