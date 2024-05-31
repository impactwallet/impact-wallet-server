import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { AirdropService } from './airdrop.service';
import { Request } from 'express';
import { AirdropClaimQueryDto } from './dto/airdrop.dto';

@ApiTags('Airdrop')
@Controller('airdrop')
export class AirdropController {
  constructor(private readonly airdropService: AirdropService) {}

  @ApiOperation({ summary: 'Get claim for holder' })
  @ApiResponse({ status: 200, description: 'Successful calculate' })
  @Get('/claim/:wallet')
  getClaimByWallet(
    @Param('wallet') wallet: string,
    @Headers('x-tzoffset') tzOffset: string,
  ) {
    return this.airdropService.getClaimByWallet(wallet, +tzOffset);
  }

  @ApiOperation({ summary: 'Create claim to holder by wallet' })
  @ApiResponse({ status: 200, description: 'Successful calculate' })
  @Get('/claim/:wallet/create')
  createClaimTransaction(
    @Param('wallet') wallet: string,
    @Query(new ValidationPipe()) query: AirdropClaimQueryDto,
  ) {
    return this.airdropService.createClaimTransaction(wallet, query);
  }

  @ApiOperation({ summary: 'Send claim to holder by wallet' })
  @ApiResponse({ status: 200, description: 'Successful calculate' })
  @Post('/claim/:wallet/create')
  sendClaimTransaction(@Param('wallet') wallet: string, @Body() body: any) {
    return this.airdropService.sendClaimTransaction(wallet, body);
  }
}
