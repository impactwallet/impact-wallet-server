import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { ApiService } from 'src/api-service/api.service';
import { get, isNil } from 'lodash';
import { SendAssetsDto } from './dto/send-assets.dto';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Member, MemberDocument } from 'src/members/schema/member.schema';
import { OrgDocument } from 'src/orgs/schema/org.schema';
import { Role } from '../members/enum/roles.enum';
import { User, UserDocument } from './schema/user.schema';
import { UsersServiceBase } from './users.service.base';
import { EquityType } from '../members/enum/equity-type.enum';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersServiceLite extends UsersServiceBase {

  constructor(
  @InjectModel(User.name) userRepository: Model<UserDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    private apiService: ApiService,
    jwtService: JwtService,
  ) {
    super(userRepository, jwtService);
  }

  async sendAssets(sendAssetsDto: SendAssetsDto, sender: UserDocument, orgId: string) {
    const orgObjectId = new mongoose.Types.ObjectId(orgId);
    let recipientAddress: string;
    let recipient: UserDocument;
    if (!isNil(sendAssetsDto.recipientId)) {
      recipient = await this.getByUserId(sendAssetsDto.recipientId, undefined);
      recipientAddress = recipient.wallet;
    } else {
      recipientAddress = sendAssetsDto.recipientAddress;
    }
    const senderPassword = (await this.getByUserId(sender._id.toString(), '+password')).password;
    const senderMember = await this.memberRepository.findOne({
      user: sender._id,
      org: orgObjectId,
    }).populate('org');

    if (isNil(senderMember)) {
      throw new NotFoundException('Sender member not found');
    }
    if (senderMember.lamportsEarned < sendAssetsDto.amount * LAMPORTS_PER_SOL) {
      throw new BadRequestException('Not enough tokens to send');
    }

    const org = senderMember.org as OrgDocument;
    const transferFn = this.transfer.bind(this, sender, senderPassword, recipientAddress, org.mint, sendAssetsDto.amount);
    let signature = await transferFn();
    signature = await this.apiService.confirmTxnWithRetry(signature, transferFn);

    if (!isNil(recipient)) {
      const recepientMember = await this.memberRepository.findOne({
        user: recipient._id,
        org: orgObjectId,
      });

      if (isNil(recepientMember)) {
        const newMember = new this.memberRepository({
          role: Role.Member,
          occupation: 'Receiver',
          user: recipient._id,
          org: orgObjectId,
          lamportsEarned: sendAssetsDto.amount * LAMPORTS_PER_SOL,
          equity: {
            amount: sendAssetsDto.amount,
            type: EquityType.Immediately,
          },
        });
        await newMember.save();
      } else {
        await this.memberRepository.findOneAndUpdate(
          { _id: recepientMember._id },
          { $inc: {
            'lamportsEarned': sendAssetsDto.amount * LAMPORTS_PER_SOL,
            'equity.amount': sendAssetsDto.amount,
          } },
        );
      }
    }

    await this.memberRepository.findOneAndUpdate(
      { _id: senderMember._id },
      { $inc: {
        'lamportsEarned': -sendAssetsDto.amount * LAMPORTS_PER_SOL,
        'equity.amount': -sendAssetsDto.amount,
      } },
    );

    this.apiService.sendNotification(`User ${sender.nickname} sent ${sendAssetsDto.amount} impact shares of ${org.name} to user ${get(recipient, 'nickname', recipientAddress)}\n\n${signature}\n\n${this.apiService.buildExplorerLink('/tx/' + signature)}`);
  }

  async transfer(source: any, sourcePassword: string, recipientAddress: string, mint: string, amount: number) {
    const fromPk = await this.apiService.getPK(source.wallet, sourcePassword);
    return this.apiService.transfer(fromPk, mint, [{ wallet: recipientAddress, amount }]);
  }
}
