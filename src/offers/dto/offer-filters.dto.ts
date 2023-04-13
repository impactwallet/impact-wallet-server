import { ApiProperty } from '@nestjs/swagger';
import { OfferStatus } from '../enum/statuses.enum';
import { Role } from '../../members/enum/roles.enum';

export class OfferFiltersDto {
  @ApiProperty({ enum: Object.values(OfferStatus), required: false })
    status?: OfferStatus;

  @ApiProperty({ required: false, enum: Object.values(Role) })
    role?: Role;
}