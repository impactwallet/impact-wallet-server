import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ContributionsService } from './contributions.service';
import { Contribution } from './schema/contribution.schema';
import { StartContributionDto } from './dto/start-contribution.dto';
import { UsersService } from '../users/users.service';
import { StopContributionDto } from './dto/stop-contribution.dto';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ContributionsFilterDto } from './dto/contributions-filter.dto';

@ApiTags('Contributions')
@Controller()
export class ContributionsController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly contributionsService: ContributionsService,
    private readonly userService: UsersService,
  ) {
  }

  @ApiTags('Users')
  @ApiOperation({ summary: 'Get users contributions' })
  @ApiResponse({ status: 200, type: [Contribution] })
  @Get('users/:userId/contributions')
  async getUserContributions(
  @Param('userId') userId: string,
    @Query(new ValidationPipe()) filter: ContributionsFilterDto,
    @Req() req: Request,
  ) {
    await this.userService.getUserFromToken(req);

    filter.userId = userId;

    return this.contributionsService.getContributions(filter);
  }

  @ApiTags('Orgs')
  @ApiOperation({ summary: 'Start contribution' })
  @ApiResponse({ status: 201, description: 'New contribution', type: Contribution })
  @Post('orgs/:orgId/contributions')
  @HttpCode(HttpStatus.CREATED)
  async startContribution(
  @Param('orgId') orgId: string,
    @Body(new ValidationPipe()) body: StartContributionDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.getUserFromToken(req);

    return this.contributionsService.startContribution(orgId, body, user);
  }

  @ApiTags('Orgs')
  @ApiOperation({ summary: 'Stop contribution' })
  @ApiResponse({ status: 200, description: 'Stopped contribution', type: Contribution })
  @Patch('orgs/:orgId/contributions/:contributionId')
  async stopContribution(
  @Param('orgId') orgId: string,
    @Param('contributionId') contributionId: string,
    @Body(new ValidationPipe()) body: StopContributionDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.getUserFromToken(req);

    return this.contributionsService.stopContribution(orgId, contributionId, user, body);
  }
}