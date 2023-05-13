import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Org, OrgDocument } from "./schema/org.schema";
import { Request } from 'express';
import mongoose, { Model } from "mongoose";
import { UsersService } from "src/users/users.service";
import { ApiService } from "src/api-service/api.service";
import { CreateOrgDto } from "./dto/create-org.dto";
import { OrgsService } from "./orgs.service";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";


@Injectable()
export class OrgsLiteService {

    constructor(
        @InjectModel(Org.name) public orgRepository: Model<OrgDocument>,
        @InjectConnection() private readonly connection: mongoose.Connection,
        private usersService: UsersService,
        private apiService: ApiService,
        private orgsService: OrgsService
    ) { }


    async createOrgLite(orgsDto: CreateOrgDto, logo: any, mock: boolean, req: Request) {
        const user = await this.usersService.getUserFromToken(req);
        const newOrg = await this.orgsService.createOrganization(orgsDto, logo, mock, req);
        this.orgsService.createToken(newOrg, { wallet: user.wallet, amount: 100 * LAMPORTS_PER_SOL });
        return newOrg;
    }


}