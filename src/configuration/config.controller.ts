import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { UsersService } from '../users/users.service';
import { Request } from 'express';
import { Config } from './schema/config.schema';
import { ConfigurationDto } from './dto/configuration.dto';



@ApiTags('Configuration')
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @ApiOperation({ summary: 'Get current configuration' })
  @ApiResponse({ status: 200 })
  @Get()
  async getConfig(@Req() req: Request) {
    return this.configService.getConfig();
  }

  @ApiOperation({ summary: 'Update current configuration' })
  @Put()
  UpdateConfig(
    @Body() configurationDto: ConfigurationDto,
      @Req() req: Request,
  ) {
    return this.configService.updateConfig(configurationDto);
  }

}