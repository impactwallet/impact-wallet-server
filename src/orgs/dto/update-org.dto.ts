import { ApiProperty } from '@nestjs/swagger';
import { Member } from 'src/members/schema/member.schema';

export class CreateOrgDto {
  @ApiProperty({ example: 'Impact-Wallet', description: 'Name of organizations', required: true })
    name: string;

  @ApiProperty({ example: 'Turn your time into equity', description: 'Information about the organization', required: false })
    description: string;

  @ApiProperty({ example: 'https://impact-wallet.com', description: 'Organization link', required: false })
    link: string;

  @ApiProperty({ example: '30', description: 'Reserved for organization needs', required: false })
    treasure: number;

  @ApiProperty({ example: 'jpg, png', description: 'Logo organization', required: false })
    logo: string;

  @ApiProperty({ example: '["0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47","0sdfsdf-7234g-4sdf8-b13vc-dfcvb52d47"]', description: 'members of organizations', required: false })
    members: Member[];

}