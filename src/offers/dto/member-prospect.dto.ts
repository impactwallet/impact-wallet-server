import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../members/enum/roles.enum';

export class MemberProspectDto {
  @ApiProperty({ example: 'CEO' })
    occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
    role: string;

  @ApiProperty({ example: 1 })
    impactRatio: number;

  @ApiProperty({ example: false })
    isMonthlyCompensated: boolean;

  @ApiProperty({ example: 3000 })
    monthlyCompensation: number;

  @ApiProperty({ example: true })
    autoContribution: boolean;

  agreement: string;
}