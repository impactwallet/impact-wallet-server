import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { CandyPayService } from './candypay.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [ApiService, CandyPayService],
  exports: [ApiService, CandyPayService],
  controllers: [ApiController],
})
export class ApiServiceModule {}
