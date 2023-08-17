import { ApiProperty } from '@nestjs/swagger';
import { TokenAmount } from '@solana/web3.js';

export class BalanceDto {
  @ApiProperty({ description: 'Balance of user' })
  readonly balance: TokenAmount;

  @ApiProperty({ description: 'Bonus balance of user' })
  readonly bonusBalance: TokenAmount;

  static create(balance: TokenAmount, bonusBalance: TokenAmount): BalanceDto {
    return {
      balance,
      bonusBalance,
    };
  }
}
