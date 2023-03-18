import { ApiProperty } from "@nestjs/swagger";
export class OrgsFilter {
    
  @ApiProperty({ example: 'Impact-Wallet', description: 'Search by name of organizations', required: false })
    name?: string;
}
