import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../enum/roles.enum';
import { InvestorSettingsDto } from './investor-settings.dto';
import { CompensationDto } from './compensation.dto';
import { Prop } from '@nestjs/mongoose';
import { EquityType } from '../enum/equity-type.enum';
import { PeriodType } from '../enum/period-type.enum';

export class MemberDto {
  @ApiProperty({ example: 'CEO', description: 'Occupation in organization' })
  occupation: string;

  @ApiProperty({
    example: 'Member',
    description: 'Role in organization',
    enum: Object.keys(Role),
  })
  role: Role;

  @ApiProperty({ example: '1.5', description: 'Impact ratio' })
  impactRatio: number;

  @ApiProperty({ example: 3000 })
  equityAmount: number;

  @ApiProperty({ example: 'Immediately', enum: Object.keys(EquityType) })
  equityType: EquityType;

  @ApiProperty({ example: 'Years', enum: Object.keys(PeriodType) })
  equityPeriod?: PeriodType;

  @ApiProperty({ description: 'Compensation settings', required: false })
  compensation: CompensationDto;

  @ApiProperty({ example: false, description: 'Auto contribution' })
  isAutoContributing: boolean;

  @ApiProperty({
    example: 40,
    default: 40,
    description: 'Hours per week',
    maximum: 112,
  })
  hoursPerWeek: number;

  @ApiProperty({ example: 'agreement.pdf', description: 'Work agreement' })
  agreement: string;

  @ApiProperty({
    example: '0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47',
    description: 'User id',
  })
  user: string;

  @ApiProperty({
    example: '0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47',
    description: 'Org user id',
  })
  orgUser: string;

  org: string;

  @ApiProperty({ type: InvestorSettingsDto, description: 'Investor settings' })
  investorSettings: InvestorSettingsDto;

  @ApiProperty({ example: 0 })
  @Prop({ type: Number, default: 0 })
  profit: number;
}
