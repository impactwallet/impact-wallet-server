import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AirdropService } from '../airdrop/airdrop.service';
import { readFileSync } from 'fs';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AirdropService);
  const excludeWallets = JSON.parse(
    readFileSync(join(__dirname, 'data/airdrop_exclude.json')).toString('utf8'),
  );
  console.log(`Starting calculation...${new Date().toISOString()}`);
  // await service.calculate(excludeWallets);
  console.log(`Finished calculation...${new Date().toISOString()}`);
  await app.close();
}
bootstrap();
