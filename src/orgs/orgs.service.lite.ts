import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Org, OrgDocument } from './schema/org.schema';
import { Request } from 'express';
import { Model } from 'mongoose';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsService } from './orgs.service';
import { EquityType } from '../members/enum/equity-type.enum';
import { AuthService } from '../auth/auth.service';
import { Role } from '../members/enum/roles.enum';

@Injectable()
export class OrgsServiceLite {
  constructor(
    @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
    private readonly authService: AuthService,
    private readonly orgsService: OrgsService,
  ) {}

  async createOrgLite(
    orgsDto: CreateOrgDto,
    logo: any,
    mock: boolean,
    req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    const userField = account.isUser ? 'user' : 'orgUser';
    orgsDto.member.equityAmount = 100;
    orgsDto.member.equityType = EquityType.Immediately;
    orgsDto.member[userField] = account.id.toString();
    orgsDto.member.role =
      orgsDto.member.role === Role.Admin ? orgsDto.member.role : Role.Admin;

    const { org } = await this.orgsService.createOrganization(
      orgsDto,
      logo,
      mock,
    );
    const initialMint = {
      wallet: account.wallet,
      amount: 100,
    };
    this.orgsService.createToken(org, initialMint).catch((err) => {
      console.log('Error creating token', err);
    });
    return {
      _id: org._id,
      username: org.username,
      name: org.name,
      logo: org.logo,
      settings: org.settings,
      lamportsMinted: org.lamportsMinted,
      wallet: org.wallet,
    };
  }
}
