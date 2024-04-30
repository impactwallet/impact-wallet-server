import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AirdropService } from '../airdrop/airdrop.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AirdropService);
  console.log(`Starting calculation...${new Date().toISOString()}`);
  await service.calculate();
  console.log(`Finished calculation...${new Date().toISOString()}`);
}
bootstrap();
