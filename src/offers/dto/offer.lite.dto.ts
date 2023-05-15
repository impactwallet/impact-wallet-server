import { ApiProperty } from '@nestjs/swagger';
import { MemberProspectLiteDto } from './member-prospect.lite.dto';

export class OfferLiteDto {
  org: string;

  @ApiProperty({ type: MemberProspectLiteDto, description: 'Member to create' })
  memberProspect: MemberProspectLiteDto;
}