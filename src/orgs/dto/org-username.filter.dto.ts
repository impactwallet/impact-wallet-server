import { ApiProperty } from "@nestjs/swagger";

export class OrgUsernameFilter {
  @ApiProperty({
    example: 'impact_wallet',
    description: 'Username to search by',
    required: true,
  })
    searchTerm: string;
}