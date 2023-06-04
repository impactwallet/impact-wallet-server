import mongoose, { ClientSession, Model } from 'mongoose';
import { UserDocument } from './schema/user.schema';
import { NotFoundException } from '@nestjs/common';
import { isNil } from 'lodash';

export class UsersServiceBase {
  constructor(protected userRepository: Model<UserDocument>) {}

  async getByUserId(id: string, select?: string, session?: ClientSession): Promise<UserDocument> {
    const user = await this.userRepository.findById(
      new mongoose.Types.ObjectId(id),
      select,
      { session },
    );
    if (isNil(user)) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}