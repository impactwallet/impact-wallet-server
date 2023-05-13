import { ApiProperty } from '@nestjs/swagger';
import { MemberDto } from '../../members/dto/members.dto';

export class OrgSettingsDto {
  @ApiProperty({ example: 30, description: 'Treasury of organization', default: 0, type: String })
    treasury: number;
}

export class CreateOrgDto {
  @ApiProperty({ example: 'impact_wallet', description: 'Username of organization', required: true })
    username: string;

  @ApiProperty({ example: 'Impact-Wallet', description: 'Name of organization', required: true })
    name: string;

  @ApiProperty({ example: 'Turn your time into equity', description: 'Information about the organization', required: false })
    description: string;

  @ApiProperty({ example: 'https://impact-wallet.com', description: 'Organization link', required: false })
    link: string;

  @ApiProperty({ required: false })
    settings: OrgSettingsDto;

  @ApiProperty({ example: 'jpg, png', description: 'Logo organization', required: true })
    logo: string;

  @ApiProperty({ type: MemberDto, description: 'First member', required: true })
    member: MemberDto;

}