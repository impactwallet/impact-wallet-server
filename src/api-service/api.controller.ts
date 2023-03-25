import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiService } from './api.service';

@ApiTags('Api')
@Controller('solana')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @ApiOperation({ summary: 'Make transfer transaction' })
  @ApiResponse({ status: 200, description: 'Successful transaction' })
  @Post('/transfer')
  transfer(@Body() body: any) {
    return this.apiService.transfer(body.fromPk, body.to, body.amount);
  }
}