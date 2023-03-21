import { ApiProperty } from '@nestjs/swagger';
import { OfferStatus } from '../enum/statuses.enum';

export class OfferFiltersDto {
  @ApiProperty({ enum: Object.values(OfferStatus), required: false })
    status?: OfferStatus;
}