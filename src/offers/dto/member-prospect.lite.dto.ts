import { ApiProperty } from '@nestjs/swagger';
import { InvestorSettingsDto } from '../../members/dto/investor-settings.dto';
import { Role } from '../../members/enum/roles.enum';
import { CompensationDto } from 'src/members/dto/compensation.dto';
import { EquityType } from '../../members/enum/equity-type.enum';
import { PeriodType } from '../../members/enum/period-type.enum';

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
