import { SaleOfferDocument } from '../../offers/schema/sale-offer.schema';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { UserDocument } from '../../users/schema/user.schema';

export class EntityFromTxnDto {
  username: string;
  img?: string;
  sale?: SaleOfferDocument;
  org?: OrgDocument;
  from?: UserDocument | string;
}