import { IsObject } from 'class-validator';

export class NewDeplanWebhookDto {
  @IsObject()
  orgToAmount: Record<string, number>;
}
