import { ApiProperty } from '@nestjs/swagger';

export class OrgSettingsDto {
  @ApiProperty({
    example: 30,
    description: 'Treasury of organization',
    default: 0,
    type: String,
  })
  treasury: number;

  isApp: boolean;
  pricePerMonth: number;
}

export class UpdateOrgDto {
  @ApiProperty({
    example: 'impact_wallet',
    description: 'Username of organization',
    required: true,
  })
  username: string;

  @ApiProperty({
    example: 'Impact-Wallet',
    description: 'Name of organization',
    required: true,
  })
  name: string;

  @ApiProperty({
    example: 'Turn your time into equity',
    description: 'Information about the organization',
    required: false,
  })
  description: string;

  @ApiProperty({
    example: 'https://impact-wallet.com',
    description: 'Organization link',
    required: false,
  })
  link: string;

  @ApiProperty({
    example: '/orgs/logo/18004f5d-0f2b-4635-9b22-60ac8d3f24e6.jpg',
    description: 'Organization logo',
    required: false,
  })
  logo: string;

  @ApiProperty({ required: false })
  settings: OrgSettingsDto;
}
