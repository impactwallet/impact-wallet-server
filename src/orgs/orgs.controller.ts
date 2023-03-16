import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from "@nestjs/platform-express";
import { OrgsService } from "./orgs.service";
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsFilter } from './dto/orgs.filter.dto';
import { AddMemberToOrgDto } from 'src/members/dto/members.dto';
import { Member } from 'src/members/schema/member.schema';
import { Request } from 'express';

@ApiTags('Orgs')
@Controller('orgs')
export class OrgsController {

  constructor(private readonly orgsService: OrgsService) {
  }

  @ApiOperation({ summary: 'Create organization' })
  @ApiResponse({ status: 201, type: Org })
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @HttpCode(HttpStatus.CREATED)
  createOrg(
    @Body() createOrgDto: CreateOrgDto,
      @UploadedFile() image,
      @Req() req: Request
  ): Promise<Org> {
    return this.orgsService.createOrg(createOrgDto, image, req)
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
  getByUserId(@Param('id') id: string, @Req() req: Request) {
    return this.orgsService.getByOrgId(id, req);
  }

  @ApiOperation({ summary: 'Add member to organization' })
  @ApiResponse({ status: 200, type: Member })
  @Post(':id/users')
  @HttpCode(HttpStatus.CREATED)
  addMemberToOrg(
    @Param('id') id: string, @Body() addMemberToOrg: AddMemberToOrgDto,
      @Req() req: Request
  ): Promise<Member> {
    return this.orgsService.addMemberToOrg(id, addMemberToOrg, req);
  }
}
