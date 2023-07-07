import { ApiProperty } from '@nestjs/swagger';
import { InvestorSettingsDto } from '../../members/dto/investor-settings.dto';
import { Role } from '../../members/enum/roles.enum';
import { CompensationDto } from '../../members/dto/compensation.dto';

export class MemberProspectDto {
  @ApiProperty({ example: 'CEO' })
    occupation: string;

  @ApiProperty({ example: 'Member', enum: Object.keys(Role) })
    role: Role;

  @ApiProperty({ example: 1 })
    impactRatio: number;

  @ApiProperty({ description: 'Compensation settings' })
    compensation: CompensationDto;

  @ApiProperty({ example: false, default: false })
    isAutoContributing: boolean;

  @ApiProperty({ example: 40, default: 40, maximum: 112 })
    hoursPerWeek: number;

  agreement: string;

  @ApiProperty({ description: 'Future investor settings' })
    investorSettings: InvestorSettingsDto;
}