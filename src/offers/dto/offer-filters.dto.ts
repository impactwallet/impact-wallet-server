import { ApiProperty } from '@nestjs/swagger';
import { OfferStatus } from '../enum/statuses.enum';
import { OfferType } from '../enum/offer-type.enum';

export class OfferFiltersDto {
  @ApiProperty({ enum: Object.values(OfferStatus), required: false })
  status?: OfferStatus;

  @ApiProperty({ required: false, enum: Object.values(OfferType) })
  type?: OfferType;
}
