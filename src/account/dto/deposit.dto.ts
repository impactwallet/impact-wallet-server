import { IsNumber } from 'class-validator';

export class DepositCreditsDto {
  @IsNumber()
  amount: number;
}
