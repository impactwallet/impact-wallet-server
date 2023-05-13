import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Org, OrgDocument } from './schema/org.schema';
import { Request } from 'express';
import { Model } from 'mongoose';
import { UsersService } from 'src/users/users.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsService } from './orgs.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { MembersService } from '../members/members.service';


@Injectable()
export class OrgsLiteService {

  constructor(
    @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
    private usersService: UsersService,
    private orgsService: OrgsService,
    private memberService: MembersService,
  ) { }


  async createOrgLite(orgsDto: CreateOrgDto, logo: any, mock: boolean, req: Request) {
    const user = await this.usersService.getUserFromToken(req);
    const { org, member } = await this.orgsService.createOrganization(orgsDto, logo, mock);
    const initialMint = { wallet: user.wallet, amount: 100 * LAMPORTS_PER_SOL };
    this.orgsService.createToken(org, initialMint)
      .then(() => {
        this.memberService.updateContributed(member._id, 0, initialMint.amount).exec();
      });
    return org;
  }


}