import { CheckoutItemEntity } from '@candypay/checkout-sdk';
import { Org } from '../../orgs/schema/org.schema';

export class CreateCpSessionDto {
  org: Org;
  items: CheckoutItemEntity[];
}