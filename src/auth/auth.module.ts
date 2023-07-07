import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schema/user.schema';
import { Org, OrgSchema } from '../orgs/schema/org.schema';
import { JwtModule } from '@nestjs/jwt';
import { Member, MemberSchema } from '../members/schema/member.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Org.name, schema: OrgSchema },
            { name: Member.name, schema: MemberSchema }
        ]),
        JwtModule.register({
            secret: process.env.PRIVATE_KEY || 'SECRET'
        })
    ],
    providers: [AuthService],
    controllers: [AuthController],
    exports: [AuthService]
})
export class AuthModule {}
