import { Types } from 'mongoose';
import { Role } from '../enum/roles.enum';

export class MembersFilterDto {
  role?: Role;
  user?: string | Types.ObjectId;
  org?: string | Types.ObjectId;
  [key: string]: any;
}