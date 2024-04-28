import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Post } from '@nestjs/common';
import { AirdropService } from './airdrop.service';

@ApiTags('Airdrop')
@Controller('airdrop')
export class AirdropController {
  constructor(private readonly airdropService: AirdropService) {}
}
