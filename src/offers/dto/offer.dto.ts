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

  @ApiProperty({ example: '0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47', description: 'Member to create' })
    memberProspect: MemberProspectDto;
}