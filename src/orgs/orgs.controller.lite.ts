import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UploadedFile, UseInterceptors, Headers, NotFoundException, Patch, ValidationPipe, Res } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateOrgDto } from './dto/create-org.dto';
import { Request } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { OrgsLiteService } from './orgs.service.lite';

@ApiTags('Orgs')
@Controller('lite/orgs')
export class OrgsLiteController {
  constructor(private readonly orgsLiteService: OrgsLiteService) {
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
