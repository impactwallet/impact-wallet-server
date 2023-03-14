import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid';
import { Model } from 'mongoose';
import { DuplicateNameException} from 'src/exceptions/duplicate-name.exception';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schema/user.schema';
import { ApiService } from 'src/api-service/api.service';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { UsersFilter } from './dto/users.filter.dto';
import { omit } from 'lodash';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { NicknameEmptyException } from 'src/exceptions/nickname-empty.exception';
import { Request } from 'express';

@Injectable()
export class UsersService {

  constructor(
    @InjectModel(User.name) private userRepository: Model<UserDocument>,
    private jwtService: JwtService,
    private apiService: ApiService
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

  async createUser(userDto: CreateUserDto, image: any): Promise<CreateUserResponseDto> {
    if (!userDto.nickname) throw new NicknameEmptyException('Nickname is empty');
    const oldUser = await this.userRepository.findOne({ nickname: userDto.nickname }).exec();
    if (oldUser) throw new DuplicateNameException(`User with nickname '${userDto.nickname}' already exists`);

    if (image) {
      const imageB64 = image.buffer.toString('base64')
      userDto.avatar = imageB64;
    }

    const newUser = new this.userRepository(userDto);
    const password = uuid();
    newUser.wallet = await this.apiService.createWallet(password);

    newUser.password = await bcrypt.hash(password, 5);
    await newUser.save();

    return await this.generateToken(newUser, password);
  }


  async getByUserId(id: string, req: Request): Promise<Omit<User, 'password'>> {
    await this.getUserFromToken(req);
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundException(`User with id '${user.id}' not found`);
    return omit(user.toObject(), ['password']);
  }

  private async generateToken(user: User, password: string): Promise<CreateUserResponseDto> {
    const payload = { name: user.name, nickname: user.nickname, wallet: user.wallet }
    const response: CreateUserResponseDto = {
      secretLink: password,
      token: this.jwtService.sign(payload),
    }

    return response;
  }

  async getUserFromToken(req: Request): Promise<User> {
    const authHeader = req.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException({ message: 'User not authorized' });
    const bearer = authHeader.split(' ')[0]
    const token = authHeader.split(' ')[1]
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException({ message: 'User not authorized' })
    }
    const user = this.jwtService.verify(token);
    return user;

  }

  private async getUsersByQueryWithExactMatch(query: UsersFilter): Promise<User[]> {

    const regex = {};
    if (query.name) {
      regex['name'] = query.name
    }

    if (query.nickname) {
      regex['nickname'] = query.nickname;
    }


    const users = await this.userRepository.find(regex).exec();
    const response = [];
    users.map(user => {
      response.push(omit(user.toObject(), ['password']));
    })
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
    })
    return response;
  }

}
