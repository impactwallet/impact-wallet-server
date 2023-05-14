import { ApiProperty } from "@nestjs/swagger";
import { PeriodType } from "../enum/period-type.enum";
import { CompensationType } from "../enum/compensation-type.enum";

export class CompensationDto {
    @ApiProperty({ example: 3000 })
    amount: number;

    @ApiProperty({ example: `Per Month`, enum: Object.keys(CompensationType) })
    type: CompensationType;

    @ApiProperty({ example: `Year`, enum: Object.keys(PeriodType) })
    period: PeriodType
}