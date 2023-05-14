import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UploadedFile, UseInterceptors, Headers, NotFoundException, Patch, ValidationPipe, Res } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateOrgDto } from './dto/create-org.dto';
import { Request } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { OrgsLiteService } from './orgs.service.lite';
import { Offer } from '../offers/schema/offer.schema';
import { OfferLiteDto } from '../offers/dto/offer.lite.dto';
import { UsersService } from '../users/users.service';
import { OrgsService } from './orgs.service';
import { isNil } from 'lodash';
import { OffersLiteService } from '../offers/offers.lite.service';

@ApiTags('Orgs')
@Controller('lite/orgs')
export class OrgsLiteController {
  constructor(private readonly orgsLiteService: OrgsLiteService,
    private readonly usersService: UsersService,
    private readonly orgsService: OrgsService,
    private readonly offersLiteService: OffersLiteService) {
  }


  @ApiOperation({ summary: 'Create organization in lite mode' })
  @ApiResponse({ status: 201, type: Org })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('form-data')
  @UseInterceptors(FileInterceptor('logo'))
  @ApiMockHeader('If true wallet and token creations are skipped')
  createOrg(
    @Body() createOrgDto: CreateOrgDto,
    @UploadedFile() logo: any,
    @Headers('mock') mock: string,
    @Req() req: Request,
  ): Promise<Org> {
    return this.orgsLiteService.createOrgLite(createOrgDto, logo, mock === 'true', req);
  }

  @ApiOperation({ summary: 'Create new offer in lite mode' })
  @ApiResponse({ status: 200, type: Offer })
  @Post('lite/:orgId/offers')
  @HttpCode(HttpStatus.CREATED)
  async createOffer(
    @Param('orgId') orgId: string,
    @Body() offer: OfferLiteDto,
    @Req() req: Request,
  ) {
    await this.usersService.getUserFromToken(req);

    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    return this.offersLiteService.createLiteOffer(orgId, offer);
  }


}
