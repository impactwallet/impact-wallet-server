import mongoose, { ClientSession, Model } from 'mongoose';
import { UserDocument } from './schema/user.schema';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { get, isNil } from 'lodash';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';

export class UsersServiceBase {
  constructor(protected userRepository: Model<UserDocument>, protected jwtService: JwtService) {}

  async getUserFromToken(req: Request): Promise<UserDocument> {
    const authHeader: string = req.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException({ message: 'User not authorized' });
    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException({ message: 'User not authorized' });
    }
    const payload = this.jwtService.verify(token);
    const user = await this.userRepository.findById(get(payload, '_id'));

    if (isNil(user)) {
      throw new UnauthorizedException({ message: 'User not authorized' });
    }

    return user;
  }

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