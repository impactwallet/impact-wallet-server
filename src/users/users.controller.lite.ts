import { Body, Controller, Param, Post, HttpStatus } from '@nestjs/common';
import { HttpCode, Req } from '@nestjs/common/decorators';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SendAssetsDto } from 'src/users/dto/send-assets.dto';
import { UsersServiceLite } from './users.service.lite';
import { AuthService } from '../auth/auth.service';

@ApiTags('Users - Lite')
@Controller('lite/users')
export class UsersControllerLite {

  constructor(
    private readonly userServiceLite: UsersServiceLite,
    private readonly authService: AuthService,
  ) {
  }

  @ApiOperation({ summary: 'Send Assets' })
  @ApiResponse({ status: 200 })
  @Post('assets/:orgId/send')
  @HttpCode(HttpStatus.OK)
  async sendAsset(
  @Param('orgId') orgId: string,
    @Body() sendAssetsDto: SendAssetsDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);

    return this.userServiceLite.sendAssets(sendAssetsDto, account, orgId);
  }
}
