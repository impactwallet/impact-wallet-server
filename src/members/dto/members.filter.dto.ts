import { Types } from 'mongoose';
import { Role } from '../enum/roles.enum';

export class MembersFilterDto {
  role?: Role;
  user?: string | Types.ObjectId;
  org?: string | Types.ObjectId;
  equity?: any;
  limit?: number;
  [key: string]: any;
}
