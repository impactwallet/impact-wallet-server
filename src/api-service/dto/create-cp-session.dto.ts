import { CheckoutItemEntity } from '@candypay/checkout-sdk';

export class CreateCpSessionDto {
  logo: string;
  receiver: { wallet: string, name: string };
  items: CheckoutItemEntity[];
}