import { ApiProperty } from '@nestjs/swagger';
export class OrgsFilter {
    
  @ApiProperty({ example: 'Impact-Wallet', description: 'Search by name of organizations', required: false })
    username?: string;

  @ApiProperty({ description: 'Specifies if search by username should be exact', required: false })
    isExactMatch?: boolean;
}
