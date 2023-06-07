import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Org, OrgDocument } from './schema/org.schema';
import { Request } from 'express';
import { Model } from 'mongoose';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsService } from './orgs.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { MembersService } from '../members/members.service';
import { EquityType } from '../members/enum/equity-type.enum';
import { AuthService } from '../auth/auth.service';


@Injectable()
export class OrgsServiceLite {

  constructor(
    @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
    private readonly authService: AuthService,
    private readonly orgsService: OrgsService,
    private readonly memberService: MembersService,
  ) { }


  async createOrgLite(orgsDto: CreateOrgDto, logo: any, mock: boolean, req: Request) {
    const user = await this.authService.getAccountFromToken(req);
    orgsDto.member.equity = { amount: 100, type: EquityType.Immediately };

    const { org, member } = await this.orgsService.createOrganization(orgsDto, logo, mock);
    const initialMint = { wallet: user.wallet, amount: 100 * LAMPORTS_PER_SOL };
    this.orgsService.createToken(org, initialMint)
      .then(() => {
        this.memberService.updateContributed(member._id, 0, initialMint.amount).exec();
      });
    return {
      "_id": org._id,
      "username": org.username,
      "name": org.name,
      "logo": org.logo,
      "settings": org.settings,
      "lamportsMinted": org.lamportsMinted,
      "wallet": org.wallet,
    };
  }
}