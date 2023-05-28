import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UploadedFile, UseInterceptors, Headers, NotFoundException, Patch, ValidationPipe } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { OrgsLiteService } from './orgs.service.lite';
import { Offer } from '../offers/schema/offer.schema';
import { OfferLiteDto } from '../offers/dto/offer.lite.dto';
import { OrgsService } from './orgs.service';
import { isNil } from 'lodash';
import { CreateOrgDto } from './dto/create-org.dto';
import { OfferStatusBodyDto } from '../offers/dto/offer-status.dto';
import { AuthService } from '../auth/auth.service';

@ApiTags('Orgs - Lite')
@Controller('lite/orgs')
export class OrgsLiteController {
  constructor(
    private readonly orgsLiteService: OrgsLiteService,
    private readonly orgsService: OrgsService,
    private readonly authService: AuthService,
  ) {
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

}
