import { ApiProperty } from '@nestjs/swagger';
import { MemberProspectDto } from './member-prospect.dto';

export class OfferDto {
  org: string;

  @ApiProperty({ description: 'Member to create' })
    memberProspect: MemberProspectDto;
}