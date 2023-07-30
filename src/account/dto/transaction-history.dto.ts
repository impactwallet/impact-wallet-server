import { ApiProperty } from "@nestjs/swagger";

export class TransactionHistoryDto {

    @ApiProperty({ example: 100, description: 'Trunsaction amount' })
    amount: number;

    @ApiProperty({ example: 'Commission', description: 'Trunsaction description' })
    description: string;

  }
