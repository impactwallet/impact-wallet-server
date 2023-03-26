import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class ReceivePaymentDto {
  @ApiProperty({ example: 'Service', description: 'The item to receive a payment for' })
  @IsNotEmpty()
  @IsString()
    item: string;

  @ApiProperty({ example: 10, description: 'Price for the item in USD' })
  @IsNotEmpty()
  @IsNumber()
    amount: number;
}