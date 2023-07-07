import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OfferStatusBodyDto } from './dto/offer-status.dto';
import { SaleOffer } from './schema/sale-offer.schema';
import { OffersService } from './offers.service';
import { SaleOfferDto } from './dto/sale-offer.dto';
import { AuthService } from '../auth/auth.service';
import { OfferDto } from './dto/offer.dto';
import { Offer } from './schema/offer.schema';
import { OrgsService } from '../orgs/orgs.service';
import { isNil } from 'lodash';
import { OfferFiltersDto } from './dto/offer-filters.dto';

@ApiTags('Offers')
@Controller()
export class OffersController {
  constructor(
    private readonly offerService: OffersService,
    private readonly authService: AuthService,
    private readonly orgsService: OrgsService,
  ) {}

  @ApiOperation({ summary: 'Create sale offer'})
  @ApiResponse({ status: 201, type: SaleOffer })
  @Post('offers/sale')
  @HttpCode(HttpStatus.CREATED)
  async saleAssets(
  @Body() saleOfferDto: SaleOfferDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);

    return this.offerService.createSaleOffer(saleOfferDto, account);
  }
  
  @ApiOperation({ summary: 'Get sale offer by ID' })
  @ApiResponse({ status: 200, type: SaleOffer })
  @Get('offers/sale/:offerId')
  async getSaleOfferById(
  @Param('offerId') offerId: string,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    const offer = await this.offerService.getSaleOfferById(offerId, ['org']);
    await offer.populateSeller();
    return offer;
  }

  @ApiOperation({ summary: 'Accept/decline sale offer' })
  @ApiResponse({ status: 200, description: 'Offer status updated' })
  @ApiResponse({ status: 403, description: 'Offer already accepted/declined' })
  @Patch('offers/sale/:offerId')
  async updateSaleOfferStatus(
  @Param('offerId') offerId: string,
    @Body(new ValidationPipe()) body: OfferStatusBodyDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);

    return this.offerService.updateSaleOfferStatus(offerId, body, account);
  }

  @ApiOperation({ summary: 'Create new offer' })
  @ApiResponse({ status: 200, type: Offer })
  @ApiTags('Orgs')
  @Post('orgs/:orgId/offers')
  @HttpCode(HttpStatus.CREATED)
  async createOffer(
  @Param('orgId') orgId: string,
    @Body() offer: OfferDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);

    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    return this.offerService.createOffer(orgId, offer);
  }

  @ApiOperation({ summary: 'Get org offers' })
  @ApiResponse({ status: 200, type: [Offer] })
  @ApiTags('Orgs')
  @Get('orgs/:orgId/offers')
  async getOrgOffers(@Param('orgId') orgId: string, @Query() filters: OfferFiltersDto, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.offerService.getOrgOffers(orgId, filters);
  }

  @ApiOperation({ summary: 'Get org offer by ID' })
  @ApiResponse({ status: 200, type: Offer })
  @ApiTags('Orgs')
  @Get('orgs/:orgId/offers/:offerId')
  async getOrgOfferById(
  @Param('orgId') orgId: string,
    @Param('offerId') offerId: string,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.offerService.getOrgOfferById(orgId, offerId);
  }

  @ApiOperation({ summary: 'Accept/decline offer' })
  @ApiResponse({ status: 200, description: 'Offer status updated and new member added to the org' })
  @ApiResponse({ status: 403, description: 'Offer already accepted/declined' })
  @ApiTags('Orgs')
  @Patch('orgs/:orgId/offers/:offerId')
  async updateOfferStatus(
  @Param('orgId') orgId: string,
    @Param('offerId') offerId: string,
    @Body(new ValidationPipe()) body: OfferStatusBodyDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);

    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    return this.offerService.updateOfferStatus(org, offerId, body, account);
  }
}