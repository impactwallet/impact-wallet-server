import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OfferStatusBodyDto } from './dto/offer-status.dto';
import { SaleOffer } from './schema/sale-offer.schema';
import { OffersService } from './offers.service';
import { UsersService } from '../users/users.service';
import { SaleOfferDto } from './dto/sale-offer.dto';

@ApiTags('Offers')
@Controller('offers')
export class OffersController {
  constructor(
    private readonly offerService: OffersService,
    private readonly userService: UsersService,
  ) {}

  @ApiOperation({ summary: 'Create sale offer'})
  @ApiResponse({ status: 201, type: SaleOffer })
  @Post('sale')
  @HttpCode(HttpStatus.CREATED)
  async saleAssets(
  @Body() saleOfferDto: SaleOfferDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.getUserFromToken(req);
    if (user._id.toString() !== saleOfferDto.userId) {
      throw new UnauthorizedException('You are not allowed to sell assets of other users');
    }

    return this.offerService.createSaleOffer(saleOfferDto);
  }
  
  @ApiOperation({ summary: 'Get sale offer by ID' })
  @ApiResponse({ status: 200, type: SaleOffer })
  @Get('sale/:offerId')
  async getSaleOfferById(
  @Param('offerId') offerId: string,
    @Req() req: Request,
  ) {
    await this.userService.getUserFromToken(req);
    return this.offerService.getSaleOfferById(offerId, ['org', 'seller']);
  }

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

    return this.offerService.updateSaleOfferStatus(offerId, body, user._id.toString());
  }
}