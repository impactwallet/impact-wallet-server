import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AirdropService } from '../airdrop/airdrop.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AirdropService);
  console.log('Starting calculation...');
  await service.calculate();
}
bootstrap();
