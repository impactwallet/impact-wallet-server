import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param, Req } from '@nestjs/common';
import { AirdropService } from './airdrop.service';
import { Request } from 'express';

@ApiTags('Airdrop')
@Controller('airdrop')
export class AirdropController {
  constructor(private readonly airdropService: AirdropService) {}

  @ApiOperation({ summary: 'Get claim for holder' })
  @ApiResponse({ status: 200, description: 'Successful calculate' })
  @Get('/claim/:wallet')
  getClaimByWallet(@Param('wallet') wallet: string, @Req() req: Request) {
    return this.airdropService.getClaimByWallet(wallet);
  }

  @ApiOperation({ summary: 'Sent claim to holder by wallet' })
  @ApiResponse({ status: 200, description: 'Successful calculate' })
  @Get('/claim/:wallet/create')
  createClaimTransaction(@Param('wallet') wallet: string, @Req() req: Request) {
    return this.airdropService.createClaimTransaction(wallet);
  }
}
