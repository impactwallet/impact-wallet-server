import { ApiProperty } from '@nestjs/swagger';
import { InvestorSettingsDto } from '../../members/dto/investor-settings.dto';
import { Role } from '../../members/enum/roles.enum';
import { CompensationDto } from 'src/members/dto/compensation.dto';
import { EquityDto } from '../../members/dto/equity.dto';

export class MemberProspectLiteDto {
  @ApiProperty({ example: 'CEO' })
  occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
  role: string;

  @ApiProperty({ type: EquityDto, description: 'Equity settings' })
  equity: EquityDto;

  @ApiProperty({ type: CompensationDto, description: 'Compensation settings' })
  compensation: CompensationDto;

  agreement: string;

  @ApiProperty({ description: 'Future investor settings' })
  investorSettings: InvestorSettingsDto;
}