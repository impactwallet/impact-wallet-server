import { Types } from "mongoose";

export class MembersFilterDto {
  user?: string | Types.ObjectId;
  org?: string | Types.ObjectId;
}