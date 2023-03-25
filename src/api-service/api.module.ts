import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
  imports: [HttpModule],
  providers: [ApiService],
  exports: [ApiService],
  controllers: [ApiController],
})
export class ApiServiceModule {}
