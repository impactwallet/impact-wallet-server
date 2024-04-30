import mongoose, { ClientSession, Model } from 'mongoose';
import { UserDocument } from './schema/user.schema';
import { NotFoundException } from '@nestjs/common';
import { isNil } from 'lodash';
import { ApiService } from '../api-service/api.service';
import { UserNonce } from './schema/user-nonce.schema';
import { encode } from 'bs58';

export class UsersServiceBase {
  constructor(
    protected userRepository: Model<UserDocument>,
    protected userNonceModel: Model<UserNonce>,
    protected apiService: ApiService,
  ) {}

  async getByUserId(
    id: string,
    select?: string,
    session?: ClientSession,
  ): Promise<UserDocument> {
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

  async getNonce(wallet: string) {
    let userNonce = await this.userNonceModel.findOne({
      wallet,
    });
    if (isNil(userNonce)) {
      const nonce = await this.apiService.createNonceAccount();
      userNonce = new this.userNonceModel({
        wallet,
        nonce: encode(nonce.secretKey),
      });
      await userNonce.save();
    }
    return userNonce;
  }
}
