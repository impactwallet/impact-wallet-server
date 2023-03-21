import { ApiProperty } from '@nestjs/swagger';
import { OfferStatus } from '../enum/statuses.enum';
import { MemberProspectDto } from './member-prospect.dto';

export class OfferDto {
  @ApiProperty({
    example: 'Approved',
    description: 'Offer status',
    enum: Object.values(OfferStatus),
    default: OfferStatus.Pending,
  })
    status: OfferStatus;

  org: string;

  @ApiProperty({ description: 'Member to create' })
    memberProspect: MemberProspectDto;
}