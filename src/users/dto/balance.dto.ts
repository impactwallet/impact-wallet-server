import { ApiProperty } from '@nestjs/swagger';
import { TokenAmount } from '@solana/web3.js';

export class BalanceDto {
  @ApiProperty({ description: 'Balance of user' })
  readonly balance: TokenAmount;

  @ApiProperty({ description: 'Bonus balance of user' })
  readonly bonusBalance: TokenAmount;

  @ApiProperty({ description: 'USDC balance of user' })
  readonly usdcBalance: number;

  static create(
    balance: TokenAmount,
    bonusBalance: TokenAmount,
    usdcBalance: number,
  ): BalanceDto {
    return {
      balance,
      bonusBalance,
      usdcBalance,
    };
  }
}
