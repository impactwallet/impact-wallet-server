import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { StartContributionLiteDto } from './dto/start-contribution.lite.dto';
import { ContributionsServiceLite } from './contributions.service.lite';
import { AuthService } from '../auth/auth.service';

@ApiTags('Contributions - Lite')
@Controller()
export class ContributionsControllerLite {
  constructor(
    private readonly contributionsService: ContributionsServiceLite,
    private readonly userService: UsersService,
    private readonly authService: AuthService,
  ) {
  }

  @ApiTags('Orgs - Lite')
  @ApiOperation({ summary: 'Record contribution' })
  @ApiResponse({ status: 201, description: 'New contribution', type: String })
  @Post('lite/orgs/:orgId/contributions')
  @HttpCode(HttpStatus.CREATED)
  async startContribution(
  @Param('orgId') orgId: string,
    @Body(new ValidationPipe()) body: StartContributionLiteDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getUserFromToken(req);

    return {
      txnHash: await this.contributionsService.recordContribution(orgId, body, account),
    };
  }
}