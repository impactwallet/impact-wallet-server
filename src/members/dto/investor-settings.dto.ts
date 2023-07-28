import { ApiProperty } from '@nestjs/swagger';
import { Min } from 'class-validator';
import { isBigInt } from '@nestjs/swagger/dist/plugin/utils/ast-utils';

export class InvestorSettingsDto {
    @ApiProperty({ description: 'Investment amount', type: BigInt })
    investmentAmount: bigint;

    @ApiProperty({ description: 'Equity allocation', type: Number })
    equityAllocation: number;

    @ApiProperty({
        example: 1,
        description: 'Minimal Investment',
        type: BigInt,
        default: 1
    })
    @Min(1, { message: 'Minimal investment must be at least 1' })
    minimalInvestment: bigint;
}
