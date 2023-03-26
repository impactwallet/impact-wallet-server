import { CheckoutItemEntity } from '@candypay/checkout-sdk';

export class CreateCpSessionDto {
  items: CheckoutItemEntity[];
}