import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Post } from '@nestjs/common';
import { AirdropService } from './airdrop.service';

@ApiTags('Airdrop')
@Controller('airdrop')
export class AirdropController {
  constructor(private readonly airdropService: AirdropService) {}

  @ApiOperation({ summary: 'Calculate airdrop' })
  @ApiResponse({ status: 200, description: 'Successful calculate' })
  @Post('/calculate')
  calculate(@Body() body: any) {
    return this.airdropService.calculate();
  }
}
