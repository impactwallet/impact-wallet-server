import { Body, Controller, Param, Post, HttpStatus } from '@nestjs/common';
import { HttpCode, Req } from '@nestjs/common/decorators';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SendAssetsDto } from 'src/users/dto/send-assets.dto';
import { UsersServiceLite } from './users.service.lite';

@ApiTags('Users - Lite')
@Controller('lite/users')
export class UsersControllerLite {

  constructor(
    private readonly userServiceLite: UsersServiceLite,
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
    const sender = await this.userServiceLite.getUserFromToken(req);

    return this.userServiceLite.sendAssets(sendAssetsDto, sender, orgId);
  }
}
