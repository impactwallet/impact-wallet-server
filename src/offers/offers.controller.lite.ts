import { Body, Controller, Param, Patch, Req, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OfferStatusBodyDto } from './dto/offer-status.dto';
import { UsersService } from '../users/users.service';
import { OffersLiteService } from './offers.service.lite';

@ApiTags('Offers - Lite')
@Controller('lite/offers')
export class OffersControllerLite {
  constructor(
    private readonly offerServiceLite: OffersLiteService,
    private readonly userService: UsersService,
  ) {}

  @ApiOperation({ summary: 'Accept/decline sale offer' })
  @ApiResponse({ status: 200, description: 'Offer status updated' })
  @ApiResponse({ status: 403, description: 'Offer already accepted/declined' })
  @Patch('sale/:offerId')
  async updateSaleOfferStatus(
  @Param('offerId') offerId: string,
    @Body(new ValidationPipe()) body: OfferStatusBodyDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.getUserFromToken(req);

    return this.offerServiceLite.updateSaleOfferStatus(offerId, body, user._id.toString());
  }
}