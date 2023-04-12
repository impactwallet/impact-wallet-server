import { ApiProperty } from '@nestjs/swagger';
import { InvestorSettingsDto } from '../../members/dto/investor-settings.dto';
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

  @ApiProperty({ example: false, default: false })
    isAutoContributing: boolean;

  @ApiProperty({ example: 40, default: 40, maximum: 112 })
    hoursPerWeek: number;

  agreement: string;

  @ApiProperty({ description: 'Future investor settings' })
    investorSettings: InvestorSettingsDto;
}