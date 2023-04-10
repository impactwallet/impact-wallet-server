import { Injectable, NotFoundException, UnauthorizedException, ConflictException, HttpException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuid } from 'uuid';
import mongoose, { ClientSession, Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schema/user.schema';
import { ApiService } from 'src/api-service/api.service';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { UsersFilter } from './dto/users.filter.dto';
import { get, isNil, omit } from 'lodash';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { Request } from 'express';
import { MembersService } from '../members/members.service';
import { resizeBuffer } from '../utils/images';
import { S3Service } from 'src/s3/s3.service';
import { SendAssetsDto } from './dto/send-assets.dto';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Member, MemberDocument } from 'src/members/schema/member.schema';
import { OrgDocument } from 'src/orgs/schema/org.schema';
import { Role } from '../members/enum/roles.enum';
import { SendUsdcDto } from './dto/send-usdc.dto';

@Injectable()
export class UsersService {

  constructor(
    @InjectModel(User.name) private userRepository: Model<UserDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
    private jwtService: JwtService,
    private apiService: ApiService,
    private membersService: MembersService,
    private s3Service: S3Service
  ) { }

  async getUsersByNicknamePrivate(name: string): Promise<User[]> {
    const regex = new RegExp(name.toString(), 'i');
    const users = await this.userRepository.find({ nickname: regex }).populate('orgs').exec();
    if (!users) throw new NotFoundException(`User with nickname '${name}' not found`);
    return users;
  }

  async userExist(searchUserByNicknameDto: SearchUserByNicknameDto) {
    const regex = new RegExp(`^${searchUserByNicknameDto.nickname}$`, 'i');
    const user = await this.userRepository.findOne({ nickname: regex });
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
      const resized = await resizeBuffer(avatar.buffer);
      const fileName = `${uuid()}.jpg`;
      await this.s3Service.putFile(fileName, resized);
      userDto.avatar = `/users/avatar/${fileName}`;
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
          newUser.password = uuid();
          newUser.wallet = await this.apiService.createWallet(newUser.password);
          this.apiService.sendNotification(`New wallet created for user ${newUser.nickname}:\n\n${newUser.wallet}\n\n${this.apiService.buildExplorerLink('/address/' + newUser.wallet)}`);
        }

        newUser.secretLink = secretLink;

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
      //TODO return endpoint
      secretLink: `https://app.impactwallet.xyz/restore/${secretLink}`,
      token: this.jwtService.sign(payload),
    };
  }

  async restoreUser(secretLink: string): Promise<CreateUserResponseDto> {
    const user = await this.getBySecretLink(secretLink);
    const payload = {
      _id: user._id,
      name: user.name,
      nickname: user.nickname,
      wallet: user.wallet,
    };
    return {
      //TODO return endpoint
      secretLink: `https://app.impactwallet.xyz/restore/${user.secretLink}`,
      token: this.jwtService.sign(payload),
    };
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

  private async getBySecretLink(secretLink: string) {
    const user = await this.userRepository.findOne({ secretLink }).exec();
    if (isNil(user)) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

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

  async getUserMemberships(user: string, req: Request) {
    await this.getUserFromToken(req);
    const filters = { user };
    return this.membersService.getMembers(filters, 'org');
  }

  async getAvatar(fileName: string) {
    return this.s3Service.getFile(fileName);
  }

  async getUserBalance(user: User) {
    return this.apiService.getUSDCBalance(user.wallet);
  }

  async sendUsdc(sender: UserDocument, sendUsdcDto: SendUsdcDto) {
    const balance: number = await this.apiService.getUSDCBalance(sender.wallet);
    if (balance < sendUsdcDto.amount) {
      throw new BadRequestException('Not enough USDC to send');
    }

    const senderPassword = (await this.getByUserId(sender._id.toString(), '+password')).password;

    const fromPk = await this.apiService.getPK(sender.wallet, senderPassword);
    const recipients = [
      {
        wallet: sendUsdcDto.recipient,
        amount: sendUsdcDto.amount,
      },
    ];

    await this.apiService.transferUSDC(fromPk, recipients);
  }


  async sendAssets(sendAssetsDto: SendAssetsDto, sender: UserDocument, orgId: string) {
    const session = await this.connection.startSession();

    await session.withTransaction(async () => {
      const orgObjectId = new mongoose.Types.ObjectId(orgId);
      const recipient = await this.getByUserId(sendAssetsDto.recipientId, undefined, session);
      const senderPassword = (await this.getByUserId(sender._id.toString(), '+password', session)).password;
      const senderMember = await this.memberRepository.findOne({
        user: sender._id,
        org: orgObjectId,
      }).populate('org').session(session);

      if (isNil(senderMember)) {
        throw new NotFoundException('Sender member not found');
      }
      if (senderMember.lamportsEarned < sendAssetsDto.amount * LAMPORTS_PER_SOL) {
        throw new BadRequestException('Not enough tokens to send');
      }

      const org = senderMember.org as OrgDocument;

      const fromPk = await this.apiService.getPK(sender.wallet, senderPassword);
      const signature = await this.apiService.transfer(fromPk, org.mint, [{ wallet: recipient.wallet, amount: sendAssetsDto.amount }]);

      const recepientMember = await this.memberRepository.findOne({
        user: recipient._id,
        org: orgObjectId,
      }).session(session);

      if (isNil(recepientMember)) {
        const newMember = new this.memberRepository({
          role: Role.Member,
          occupation: 'Receiver',
          user: recipient._id,
          org: orgObjectId,
          lamportsEarned: sendAssetsDto.amount * LAMPORTS_PER_SOL,
        });
        await newMember.save({ session });
      } else {
        await this.memberRepository.findOneAndUpdate(
          { _id: recepientMember._id },
          { $inc: { 'lamportsEarned': sendAssetsDto.amount * LAMPORTS_PER_SOL } },
        ).session(session);
      }

      await this.memberRepository.findOneAndUpdate(
        { _id: senderMember._id },
        { $inc: { 'lamportsEarned': -sendAssetsDto.amount * LAMPORTS_PER_SOL } },
      ).session(session);

      this.apiService.sendNotification(`User ${sender.nickname} sent ${sendAssetsDto.amount} impact shares of ${org.name} to user ${recipient.nickname}\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);
    });

    await session.endSession();
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
