import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { omit } from 'lodash';
import { v4 as uuid } from 'uuid';
import { Model } from 'mongoose';
import { ApiService } from 'src/api-service/api.service';
import { DuplicateNameException } from 'src/exceptions/duplicate-name.exception';
import { UsersService } from 'src/users/users.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgsFilter } from './dto/orgs.filter.dto';
import { Org, OrgDocument } from './schema/org.schema';
import { AddMemberToOrgDto } from 'src/members/dto/members.dto';
import { MembersService } from 'src/members/members.service';
import { Member } from 'src/members/schema/member.schema';
import { Request } from 'express';

@Injectable()
export class OrgsService {
    constructor(@InjectModel(Org.name) private orgRepository: Model<OrgDocument>,
        private memberService: MembersService,
        private usersService: UsersService,
        private apiService: ApiService) { };

    async createOrg(orgsDto: CreateOrgDto, image: any, req: Request): Promise<Org> {
        await this.usersService.getUserFromToken(req);
        const oldOrg = await this.orgRepository.findOne({ name: orgsDto.name }).exec();
        if (oldOrg) throw new DuplicateNameException(`Organization with name '${orgsDto.name}' already exists`);
        if (image) {
            const imageB64 = image.buffer.toString('base64')
            orgsDto.logo = imageB64;
        }

        const newOrg = new this.orgRepository(orgsDto);

        newOrg.password = uuid();
        newOrg.wallet = await this.apiService.createWallet(newOrg.password);
        // let token = await this.apiService.createFungibleTokensForOrganization(newOrg.name, newOrg.wallet);
        newOrg.token = uuid();
        newOrg.mint = uuid();

        return await newOrg.save();
    }

    async getOrgsByQuery(query: OrgsFilter, req: Request): Promise<Org[]> {
        await this.usersService.getUserFromToken(req);

        if (query.exactMatch) {

            return await this.getOrgsByQueryWithExactMatch(query);

        }

        return await this.getOrgsWithFilter(query);
    }

    async getByOrgId(id: String, req: Request): Promise<Object> {
        await this.usersService.getUserFromToken(req);
        let org = await this.orgRepository.findById(id).populate({path : 'members', populate : { path : 'user'}});
        if (!org) throw new NotFoundException(`Organization with id '${org.id}' not found`);
        return omit(org.toObject(), ['password']);
    }

    private async getOrgsByQueryWithExactMatch(query: OrgsFilter): Promise<Org[]> {

        const regex = {};
        if (query.name) {
            regex['name'] = query.name
        }

        let orgs = await this.orgRepository.find(regex).populate({path : 'members', populate : { path : 'user'}}).exec();

        let response = [];
        orgs.map(org => {
            response.push(omit(org.toObject(), ['password']));
        })
        return response;
    }

    private async getOrgsWithFilter(query: OrgsFilter): Promise<Org[]> {

        const regex = {};
        if (query.name) {
            regex['name'] = new RegExp(query.name);
        }

        console.log(regex);

        let orgs = await this.orgRepository.find(regex).populate({path : 'members', populate : { path : 'user'}}).exec();

        let response = [];
        orgs.map(org => {
            response.push(omit(org.toObject(), ['password']));
        })
        return response;
    }

    async addMemberToOrg(id: string, addMemberToOrg: AddMemberToOrgDto, req: Request): Promise<Member> {
        await this.usersService.getUserFromToken(req);
        let org = await this.orgRepository.findById(id);
        const member = await this.memberService.createMember(addMemberToOrg)
        org.members.push(member);
        org.save();
        return this.memberService.createMember(addMemberToOrg);
    }

}
