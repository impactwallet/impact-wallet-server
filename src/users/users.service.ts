import { Injectable, NotFoundException, UnauthorizedException, ConflictException, HttpException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import mongoose, { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schema/user.schema';
import { ApiService } from 'src/api-service/api.service';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { UsersFilter } from './dto/users.filter.dto';
import { get, omit } from 'lodash';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { Request } from 'express';

@Injectable()
export class UsersService {

  constructor(
    @InjectModel(User.name) private userRepository: Model<UserDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private jwtService: JwtService,
    private apiService: ApiService,
  ) { }

  async getUsersByNicknamePrivate(name: string): Promise<User[]> {
    const regex = new RegExp(name.toString(), 'i');
    const users = await this.userRepository.find({ nickname: regex }).populate('orgs').exec();
    if (!users) throw new NotFoundException(`User with nickname '${name}' not found`);
    return users;
  }

  async userExist(searchUserByNicknameDto: SearchUserByNicknameDto) {
    const user = await this.userRepository.findOne({ nickname: searchUserByNicknameDto.nickname }).exec();        
    if (!user) throw new NotFoundException(`User with nickname '${searchUserByNicknameDto.nickname}' not found`);
    return searchUserByNicknameDto.nickname;
  }

  async getUsersByQuery(query: UsersFilter, req: Request): Promise<User[]> {
    await this.getUserFromToken(req);

    if (query.exactMatch) {

      return await this.getUsersByQueryWithExactMatch(query);

    }

    return await this.getUsersWithFilter(query);
  }

  async createUser(userDto: CreateUserDto, avatar: any, mock = false): Promise<CreateUserResponseDto> {
    if (avatar) {
      const imageB64 = avatar.buffer.toString('base64');
      userDto.avatar = imageB64;
    }
    const session = await this.connection.startSession();
    const secretLink = uuid();
    const newUser = new this.userRepository(userDto);

    await session.withTransaction(async () => {
      try {
        await newUser.save({ session });
      } catch (error) {
        if (error.code === 11000) {
          throw new ConflictException({ error });
        }
        throw new HttpException({ error }, 500);
      }
      try {
        if (!mock) {
          const password = uuid();
          newUser.wallet = await this.apiService.createWallet(password);
          newUser.password = await bcrypt.hash(password, 5);
        }
        newUser.secretLink = await bcrypt.hash(secretLink, 5);

        await newUser.save({ session });
      } catch (error) {
        const code = get(error, 'response.status', 400);
        const message = get(error, 'message', '');
        throw new HttpException({ message }, code);
      }
    });

    await session.endSession();

    const payload = {
      _id: newUser._id,
      name: newUser.name,
      nickname: newUser.nickname,
      wallet: newUser.wallet,
    };
    return {
      secretLink,
      token: this.jwtService.sign(payload),
    };
  }


  async getByUserId(id: string, req: Request): Promise<Omit<User, 'password'>> {
    await this.getUserFromToken(req);
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundException(`User with id '${user.id}' not found`);
    return omit(user.toObject(), ['password']);
  }

  async getUserFromToken(req: Request): Promise<User> {
    const authHeader: string = req.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException({ message: 'User not authorized' });
    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException({ message: 'User not authorized' });
    }
    const user = this.jwtService.verify(token);
    return user;
  }

  private async getUsersByQueryWithExactMatch(query: UsersFilter): Promise<User[]> {

    const regex = {};
    if (query.name) {
      regex['name'] = query.name;
    }

    if (query.nickname) {
      regex['nickname'] = query.nickname;
    }


    const users = await this.userRepository.find(regex).exec();
    const response = [];
    users.map(user => {
      response.push(omit(user.toObject(), ['password']));
    });
    return response;

  }

  private async getUsersWithFilter(query: UsersFilter): Promise<User[]> {

    const regex = {};
    if (query.name) {
      regex['name'] = new RegExp(query.name);
    }
    if (query.nickname) {
      regex['nickname'] = new RegExp(query.nickname);
    }

    console.log(regex);

    const users = await this.userRepository.find(regex).exec();
    const response = [];
    users.map(user => {
      response.push(omit(user.toObject(), ['password']));
    });
    return response;
  }

}
