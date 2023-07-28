import { ApiProperty } from '@nestjs/swagger';
import { OfferType } from '../enum/offer-type.enum';
import { MemberProspectLiteDto } from './member-prospect.lite.dto';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class InvestorSettings {
    @ApiProperty({
        example: 100,
        description: 'Amount',
        type: BigInt,
        default: 1
    })
    @Min(1, { message: 'Minimal investment must be at least 1' })
    amount: bigint;

    @ApiProperty({ example: 10, description: 'Equity', type: Number })
    @IsNumber()
    equity: number;

    @ApiProperty({
        example: 1,
        description: 'Minimal Investment',
        type: BigInt,
        default: 1
    })
    @Min(1, { message: 'Minimal investment must be at least 1' })
    minimalInvestment: bigint;
}

export class OfferLiteDto {
    org: string;

    @ApiProperty({
        example: 'Investor',
        description: 'Offer type',
        enum: Object.values(OfferType)
    })
    type: OfferType;

    @ApiProperty({
        type: MemberProspectLiteDto,
        description: 'Member to create'
    })
    memberProspect: MemberProspectLiteDto;

    @ApiProperty({ description: 'Future investor settings' })
    investorSettings: InvestorSettings;
}
