import { ApiProperty } from '@nestjs/swagger';
import { InvestorSettingsDto } from '../../members/dto/investor-settings.dto';
import { Role } from '../../members/enum/roles.enum';
import { EquityType } from '../../members/enum/equity-type.enum';
import { PeriodType } from '../../members/enum/period-type.enum';
import { CompensationDto } from '../../members/dto/compensation.dto';

export class MemberProspectLiteDto {
  @ApiProperty({ example: 'CEO' })
  occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
  role: Role;

  @ApiProperty({ example: 3000 })
  equityAmount: number;

  @ApiProperty({ example: 'Immediately', enum: Object.keys(EquityType) })
  equityType: EquityType;

  @ApiProperty({ example: 'Years', enum: Object.keys(PeriodType) })
  equityPeriod?: PeriodType;

  @ApiProperty({ type: CompensationDto, description: 'Compensation settings' })
  compensation: CompensationDto;

  agreement: string;

  @ApiProperty({ description: 'Future investor settings' })
  investorSettings: InvestorSettingsDto;
}
