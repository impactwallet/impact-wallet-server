import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import mongoose, { Model } from 'mongoose';
import { User, UserDocument } from '../users/schema/user.schema';
import { Org, OrgDocument } from '../orgs/schema/org.schema';
import { get, isNil } from 'lodash';
import { InjectModel } from '@nestjs/mongoose';
import { AccountModel } from './models/account.model';
import { Member, MemberDocument } from '../members/schema/member.schema';
import { Role } from '../members/enum/roles.enum';
import { AccessDeniedException } from '../exceptions/access-denied.exception';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        @InjectModel(User.name) protected userModel: Model<UserDocument>,
        @InjectModel(Org.name) protected orgModel: Model<OrgDocument>,
        @InjectModel(Member.name)
protected memberRepository: Model<MemberDocument>
    ) {}

    async getAccountFromToken(req: Request): Promise<AccountModel> {
        const authHeader: string = req.headers['authorization'];
        if (!authHeader)
            throw new UnauthorizedException({ message: 'User not authorized' });
        const bearer = authHeader.split(' ')[0];
        const token = authHeader.split(' ')[1];
        if (bearer !== 'Bearer' || !token) {
            throw new UnauthorizedException({ message: 'User not authorized' });
        }
        const payload = this.jwtService.verify(token);
        const user = await this.userModel.findById(get(payload, 'userId'));

        if (isNil(user)) {
            throw new UnauthorizedException({ message: 'User not authorized' });
        }

        const orgId = get(payload, 'orgId');
        let org: OrgDocument;
        if (!isNil(orgId)) {
            org = await this.orgModel.findById(orgId);
        }

        return new AccountModel(user, org);
    }

    async permissionCheck(orgId: string, account: AccountModel) {
        const orgObjectId = new mongoose.Types.ObjectId(orgId);
        const member = await this.memberRepository.findOne({
            $or: [{ user: account.id }, { orgUser: account.id }],

            org: orgObjectId
        });
        if (member.role !== Role.Admin)
            throw new AccessDeniedException({ message: 'Access denied' });
    }
}
