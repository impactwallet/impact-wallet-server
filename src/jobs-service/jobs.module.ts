import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [UsersModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
