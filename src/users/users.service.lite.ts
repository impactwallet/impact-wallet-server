import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { ApiService } from 'src/api-service/api.service';
import { get, isNil, set } from 'lodash';
import { SendAssetsDto } from './dto/send-assets.dto';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Member, MemberDocument } from 'src/members/schema/member.schema';
import { Org, OrgDocument } from 'src/orgs/schema/org.schema';
import { Role } from '../members/enum/roles.enum';
import { User, UserDocument } from './schema/user.schema';
import { UsersServiceBase } from './users.service.base';
import { EquityType } from '../members/enum/equity-type.enum';
import { AccountModel } from '../auth/models/account.model';
import { toBigJs } from '../utils/bigjs';

@Injectable()
export class UsersServiceLite extends UsersServiceBase {
  constructor(
    @InjectModel(User.name) userRepository: Model<UserDocument>,
    @InjectModel(Member.name) private memberRepository: Model<MemberDocument>,
    @InjectModel(Org.name) private orgRepository: Model<OrgDocument>,
    private apiService: ApiService,
  ) {
    super(userRepository);
  }

  async sendAssets(
    sendAssetsDto: SendAssetsDto,
    account: AccountModel,
    orgId: string,
  ) {
    const orgObjectId = new mongoose.Types.ObjectId(orgId);
    let recipientAddress: string;
    let recipient: UserDocument | OrgDocument;
    if (!isNil(sendAssetsDto.recipientId)) {
      recipient = await this.getByUserId(sendAssetsDto.recipientId);
      recipientAddress = recipient.wallet;
    } else if (!isNil(sendAssetsDto.recipientOrgId)) {
      recipient = await this.orgRepository.findById(
        sendAssetsDto.recipientOrgId,
      );
      recipientAddress = recipient.wallet;
    } else {
      recipientAddress = sendAssetsDto.recipientAddress;
    }
    const senderPassword = await account.password;
    const senderMember = await this.memberRepository
      .findOne({
        $or: [{ user: account.id }, { orgUser: account.id }],
        org: orgObjectId,
      })
      .populate('org');

    if (isNil(senderMember)) {
      throw new NotFoundException('Sender member not found');
    }
    const amount = toBigJs(sendAssetsDto.amount);

    const org = senderMember.org as OrgDocument;
    let signature = await this.transfer(
      account,
      senderPassword,
      recipientAddress,
      org.mint,
      amount.toNumber(),
    );

    if (!isNil(recipient)) {
      const memberQuery = {
        org: orgObjectId,
      };
      if (!isNil(sendAssetsDto.recipientId)) {
        memberQuery['user'] = recipient._id;
      } else if (!isNil(sendAssetsDto.recipientOrgId)) {
        memberQuery['orgUser'] = recipient._id;
      }
      const recepientMember = await this.memberRepository.findOne(memberQuery);

      if (isNil(recepientMember)) {
        const newMember = new this.memberRepository({
          role: Role.Member,
          occupation: 'Receiver',
          user: memberQuery['user'],
          orgUser: memberQuery['orgUser'],
          org: orgObjectId,
          equity: {
            amount,
            type: EquityType.Immediately,
          },
        });
        await newMember.save();
      }
    }

    this.apiService.sendNotification(
      `User ${account.username} sent ${amount.toNumber()}% of equity in ${
        org.name
      } to ${get(
        recipient,
        'nickname',
        get(recipient, 'username', recipientAddress),
      )}\n\n${signature}\n\n${this.apiService.buildExplorerLink(
        '/tx/' + signature,
      )}`,
    );
  }

  async transfer(
    source: any,
    sourcePassword: string,
    recipientAddress: string,
    mint: string,
    amount: number,
  ) {
    const senderPk = await this.apiService.getPK(source.wallet, sourcePassword);
    return this.apiService.transfer(mint, [
      { senderPk, wallet: recipientAddress, amount },
    ]);
  }
}
