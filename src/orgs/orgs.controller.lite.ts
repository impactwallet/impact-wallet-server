import { Body, Controller, HttpCode, HttpStatus, Post, Req, UploadedFile, UseInterceptors, Headers } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { OrgsServiceLite } from './orgs.service.lite';
import { CreateOrgDto } from './dto/create-org.dto';

@ApiTags('Orgs - Lite')
@Controller('lite/orgs')
export class OrgsLiteController {
  constructor(
    private readonly orgsLiteService: OrgsServiceLite,
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
  ) {
    return this.orgsLiteService.createOrgLite(createOrgDto, logo, mock === 'true', req);
  }

}
