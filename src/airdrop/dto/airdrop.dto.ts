import { ApiProperty } from '@nestjs/swagger';
import { TypeTransaction } from '../enum/type-transaction.enum';
import { IsNotEmpty, IsString } from 'class-validator';
import { AirdropDocument } from '../schema/airdrop.schema';
import { toBigJs } from '../../utils/bigjs';

export class AirdropDto {
  @ApiProperty({ description: 'Transaction date in epoch' })
  transactionDate: number;

  @ApiProperty({ description: 'Holder wallet' })
  wallet: string;

  @ApiProperty({ description: 'Amount of transaction' })
  amount: Big.Big;

  @ApiProperty({ description: 'Final amount for the wallet' })
  finalAmount: Big.Big;

  @ApiProperty({ description: 'Number of days tokens were held' })
  holderOfDays: number;

  @ApiProperty({ description: 'Type of transaction' })
  typeTransaction: TypeTransaction;

  @ApiProperty({ description: 'Current balance' })
  currentBalance: Big.Big;

  @ApiProperty({ description: 'Check balance' })
  balanceCheck: Big.Big;

  @ApiProperty({ description: 'Transaction' })
  transaction: string;

  @ApiProperty({ description: 'Error' })
  error: string;

  @ApiProperty({ description: 'Claim percent for the wallet' })
  claimPercent: Big.Big;

  @ApiProperty({ description: 'Has the holder received a claim' })
  isClaim: boolean;

  static fromAirdropDoc(airdropDoc: AirdropDocument) {
    const airdropDto = new AirdropDto();
    airdropDto.transactionDate = airdropDoc.transactionDate;
    airdropDto.amount = toBigJs(airdropDoc.amount);
    airdropDto.wallet = airdropDoc.wallet;
    airdropDto.typeTransaction = airdropDoc.typeTransaction;
    airdropDto.holderOfDays = airdropDoc.holderOfDays;
    airdropDto.currentBalance = toBigJs(airdropDoc.currentBalance);
    airdropDto.balanceCheck = toBigJs(airdropDoc.balanceCheck);
    airdropDto.transaction = airdropDoc.transaction;
    return airdropDto;
  }
}

export class AirdropClaimQueryDto {
  @ApiProperty({ description: 'DePlan wallet address' })
  @IsString()
  @IsNotEmpty()
  dePlanWallet: string;
}
