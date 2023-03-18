import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UploadedFile, UseInterceptors, Headers } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from "@nestjs/platform-express";
import { OrgsService } from "./orgs.service";
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsFilter } from './dto/orgs.filter.dto';
import { AddMemberToOrgDto } from 'src/members/dto/members.dto';
import { Member } from 'src/members/schema/member.schema';
import { Request } from 'express';
import { OrgUsernameFilter } from './dto/org-username.filter.dto';
import { ApiMockHeader } from '../headers/mock';

@ApiTags('Orgs')
@Controller('orgs')
export class OrgsController {

  constructor(private readonly orgsService: OrgsService) {
  }

  @ApiOperation({ summary: 'Check if an organization exists' })
  @ApiResponse({ status: 200, description: 'Organization exists' })
  @ApiResponse({ status: 404, description: 'Organization does not exist' })
  @Get('username')
  findOrgByUsername(@Query() query: OrgUsernameFilter, @Req() req) {
    return this.orgsService.findOrgByUsername(query, req);
  }


  @ApiOperation({ summary: 'Create organization' })
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
    return this.orgsService.createOrg(createOrgDto, logo, mock === 'true', req);
  }

  @ApiOperation({ summary: 'Get organizations' })
  @ApiResponse({ status: 200, type: [Org] })
  @Get()
  getOrgsByQuery(@Query() query: OrgsFilter, @Req() req: Request) {
    return this.orgsService.getOrgsByQuery(query, req);
  }

  @ApiOperation({ summary: 'Get organization by id' })
  @ApiResponse({ status: 200, type: Org })
  @Get(':id')
  getByOrgId(@Param('id') id: string, @Req() req: Request) {
    return this.orgsService.getByOrgId(id, req);
  }

  @ApiOperation({ summary: 'Add member to organization' })
  @ApiResponse({ status: 200, type: Member })
  @Post(':orgId/members')
  @HttpCode(HttpStatus.CREATED)
  addMemberToOrg(
    @Param('orgId') orgId: string,
      @Body() member: AddMemberToOrgDto,
      @Req() req: Request
  ): Promise<Member> {
    return this.orgsService.addMemberToOrg(orgId, member, req);
  }

  @ApiOperation({ summary: 'Get org members' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':orgId/members')
  getOrgMembers(@Param('orgId') orgId: string, @Req() req: Request) {
    return this.orgsService.getOrgMembers(orgId, req);
  }
}
