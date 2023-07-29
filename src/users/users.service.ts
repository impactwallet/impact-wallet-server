import {
    Injectable,
    NotFoundException,
    ConflictException,
    HttpException,
    BadRequestException
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { v4 as uuid } from 'uuid';
import mongoose, { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schema/user.schema';
import { ApiService } from 'src/api-service/api.service';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { UsersFilter } from './dto/users.filter.dto';
import {
    defaultTo,
    get,
    isEmpty,
    isEqual,
    isNil,
    omitBy,
    toNumber
} from 'lodash';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { Request } from 'express';
import { MembersService } from '../members/members.service';
import { resizeBuffer } from '../utils/images';
import { S3Service } from 'src/s3/s3.service';
import { SendAssetsDto } from './dto/send-assets.dto';
import {
    LAMPORTS_PER_SOL,
    ParsedInstruction,
    ParsedTransactionWithMeta,
    PublicKey
} from '@solana/web3.js';
import { Member, MemberDocument } from 'src/members/schema/member.schema';
import { Org, OrgDocument } from 'src/orgs/schema/org.schema';
import { Role } from '../members/enum/roles.enum';
import { SendUsdcDto } from './dto/send-usdc.dto';
import { TxnHistoryItemDto } from '../common/dto/txn-history-item.dto';
import { Payment, PaymentDocument } from '../payment/schema/payment.schema';
import { PaymentType } from '../payment/enum/payment-type.enum';
import {
    SaleOffer,
    SaleOfferDocument,
    SaleOfferModel
} from '../offers/schema/sale-offer.schema';
import { EntityFromTxnDto } from '../common/dto/entity-from-txn.dto';
import { Account } from '@solana/spl-token';
import {
    Contribution,
    ContributionDocument
} from '../contributions/schema/contribution.schema';
import { areObjectIdsEqual } from '../utils/mongo';
import { UsersServiceBase } from './users.service.base';
import { AuthService } from '../auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { AccountModel } from '../auth/models/account.model';
import { UpdateOrgDto } from '../orgs/dto/update-org.dto';
import { isDefined } from 'class-validator';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService extends UsersServiceBase {
    constructor(
        @InjectModel(User.name) userRepository: Model<UserDocument>,
        @InjectModel(Member.name)
        private memberRepository: Model<MemberDocument>,
        @InjectModel(Org.name) private orgRepository: Model<OrgDocument>,
        @InjectModel(Payment.name)
        private paymentRepository: Model<PaymentDocument>,
        @InjectModel(Contribution.name)
        private contributionRepository: Model<ContributionDocument>,
        @InjectModel(SaleOffer.name)
        private saleOfferRepository: SaleOfferModel,
        @InjectConnection() private readonly connection: mongoose.Connection,
        private apiService: ApiService,
        private membersService: MembersService,
        private jwtService: JwtService,
        private s3Service: S3Service,
        private authService: AuthService
    ) {
        super(userRepository);
    }

    async getUsersByNicknamePrivate(name: string): Promise<User[]> {
        const regex = new RegExp(name.toString(), 'i');
        const users = await this.userRepository
            .find({ nickname: regex })
            .populate('orgs')
            .exec();
        if (!users)
            throw new NotFoundException(
                `User with nickname '${name}' not found`
            );
        return users;
    }

    async userExist(searchUserByNicknameDto: SearchUserByNicknameDto) {
        const regex = new RegExp(`^${searchUserByNicknameDto.nickname}$`, 'i');
        const user = await this.userRepository.findOne({ nickname: regex });
        if (!user)
            throw new NotFoundException(
                `User with nickname '${searchUserByNicknameDto.nickname}' not found`
            );
        return searchUserByNicknameDto.nickname;
    }

    async getUsersByQuery(query: UsersFilter, req: Request): Promise<User[]> {
        await this.authService.getAccountFromToken(req);

        if (query.exactMatch) {
            return this.getUsersByQueryWithExactMatch(query);
        }

        return this.getUsersWithFilter(query);
    }

    async createUser(
        userDto: CreateUserDto,
        avatar: any,
        mock = false
    ): Promise<CreateUserResponseDto> {
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
                    newUser.wallet = await this.apiService.createWallet(
                        newUser.password
                    );
                    this.apiService.sendNotification(
                        `New wallet created for user ${newUser.nickname}:\n\n${
                            newUser.wallet
                        }\n\n${this.apiService.buildExplorerLink(
                            '/address/' + newUser.wallet
                        )}`
                    );
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
            userId: newUser._id
        };
        return {
            //TODO: return endpoint
            secretLink: `https://app.equitywallet.org/restore/${secretLink}`,
            token: this.jwtService.sign(payload)
        };
    }

    async uploadAvatar(avatar: any): Promise<string> {
        if (!avatar) throw new BadRequestException('Avatar is required');
        const resized = await resizeBuffer(avatar.buffer);
        const fileName = `${uuid()}.jpg`;
        await this.s3Service.putFile(fileName, resized);
        return `/users/avatar/${fileName}`;
    }

    async deleteAvatar(deleteAvatars: string[]) {
        if (!deleteAvatars || deleteAvatars.length === 0)
            throw new BadRequestException('File names is required');
        try {
            deleteAvatars.forEach((fileName) => {
                this.s3Service.deleteFile(fileName);
            });
        } catch (error) {
            throw new HttpException({ error }, 500);
        }
    }

    async updateUser(updateUserDto: UpdateUserDto, account: AccountModel) {
        const user = await this.userRepository.findById(new mongoose.Types.ObjectId(account.user._id));
        if (isNil(user)) {
            throw new NotFoundException({ message: 'User not found' });
        }

        if (isDefined(updateUserDto.nickname)) {
            user.nickname = updateUserDto.nickname;
        }

        if (isDefined(updateUserDto.name)) {
            user.name = updateUserDto.name;
        }

        if (isDefined(updateUserDto.avatar)) {
            user.avatar = updateUserDto.avatar;
        }

        return this.userRepository.findOneAndUpdate(
            { _id: user._id },
            { $set: user.toObject() },
            { new: true }
        );
    }

    async restoreUser(secretLink: string): Promise<CreateUserResponseDto> {
        const user = await this.getBySecretLink(secretLink);
        const payload = {
            userId: user._id
        };
        return {
            secretLink: `https://app.equitywallet.org/restore/${user.secretLink}`,
            token: this.jwtService.sign(payload)
        };
    }

    private async getBySecretLink(secretLink: string) {
        const user = await this.userRepository.findOne(
            { secretLink },
            '+secretLink'
        );
        if (isNil(user)) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    async getUserMemberships(user: string, req: Request) {
        await this.authService.getAccountFromToken(req);
        const filters = {
            user,
            $or: [{ 'equity.amount': { $gt: 0 } }, { equity: null }]
        };
        return this.membersService.getMembers(filters, 'org');
    }

    async getAvatar(fileName: string) {
        return this.s3Service.getFile(fileName);
    }

    async getUserBalance(account: AccountModel) {
        return this.apiService.getUSDCBalance(account.wallet);
    }

    async getUserAssetHistory(account: AccountModel, orgId: string) {
        const org = await this.orgRepository.findById(orgId);
        if (isNil(org)) {
            throw new NotFoundException('Organization not found');
        }
        const { associatedAddress, parsedTxns } =
            await this.apiService.getTokenHistory(account.wallet, org.mint);
        return this._buildAssetHistory(account, associatedAddress, parsedTxns);
    }

    async sendUsdc(account: AccountModel, sendUsdcDto: SendUsdcDto) {
        const balance: number = await this.apiService.getUSDCBalance(
            account.wallet
        );
        if (balance < sendUsdcDto.amount) {
            throw new BadRequestException('Not enough USDC to send');
        }

        const senderPassword = await account.password;

        const senderPk = await this.apiService.getPK(
            account.wallet,
            senderPassword
        );
        const recipients = [
            {
                senderPk,
                wallet: sendUsdcDto.recipient,
                amount: sendUsdcDto.amount
            }
        ];

        const signature = await this.apiService.transferUSDC(recipients);
        this.apiService.sendNotification(
            `User ${account.username} sent ${sendUsdcDto.amount} USDC to ${
                sendUsdcDto.recipient
            }\n\n${signature}\n\n${this.apiService.buildExplorerLink(
                '/tx/' + signature
            )}`
        );
    }

    async sendAssets(
        sendAssetsDto: SendAssetsDto,
        account: AccountModel,
        orgId: string
    ) {
        const session = await this.connection.startSession();

        await session.withTransaction(async () => {
            const orgObjectId = new mongoose.Types.ObjectId(orgId);
            let recipientAddress: string;
            let recipient: UserDocument | OrgDocument;
            if (!isNil(sendAssetsDto.recipientId)) {
                recipient = await this.getByUserId(
                    sendAssetsDto.recipientId,
                    undefined,
                    session
                );
                recipientAddress = recipient.wallet;
            } else if (!isNil(sendAssetsDto.recipientOrgId)) {
                recipient = await this.orgRepository.findById(
                    sendAssetsDto.recipientOrgId,
                    undefined,
                    { session }
                );
                recipientAddress = recipient.wallet;
            }
            {
                recipientAddress = sendAssetsDto.recipientAddress;
            }
            const senderPassword = await account.password;
            const senderMember = await this.memberRepository
                .findOne({
                    $or: [{ user: account.id }, { orgUser: account.id }],
                    org: orgObjectId
                })
                .populate('org')
                .session(session);

            if (isNil(senderMember)) {
                throw new NotFoundException('Sender member not found');
            }
            if (
                senderMember.lamportsEarned <
                sendAssetsDto.amount * LAMPORTS_PER_SOL
            ) {
                throw new BadRequestException('Not enough tokens to send');
            }

            const org = senderMember.org as OrgDocument;

            const senderPk = await this.apiService.getPK(
                account.wallet,
                senderPassword
            );
            const signature = await this.apiService.transfer(org.mint, [
                {
                    senderPk,
                    wallet: recipientAddress,
                    amount: sendAssetsDto.amount
                }
            ]);

            if (!isNil(recipient)) {
                const memberQuery = {
                    org: orgObjectId
                };
                if (!isNil(sendAssetsDto.recipientId)) {
                    memberQuery['user'] = recipient._id;
                } else if (!isNil(sendAssetsDto.recipientOrgId)) {
                    memberQuery['orgUser'] = recipient._id;
                }
                const recepientMember = await this.memberRepository
                    .findOne(memberQuery)
                    .session(session);

                if (isNil(recepientMember)) {
                    const newMember = new this.memberRepository({
                        role: Role.Member,
                        occupation: 'Receiver',
                        user: memberQuery['user'],
                        orgUser: memberQuery['orgUser'],
                        org: orgObjectId,
                        lamportsEarned: sendAssetsDto.amount * LAMPORTS_PER_SOL
                    });
                    await newMember.save({ session });
                } else {
                    await this.memberRepository
                        .findOneAndUpdate(
                            { _id: recepientMember._id },
                            {
                                $inc: {
                                    lamportsEarned:
                                        sendAssetsDto.amount * LAMPORTS_PER_SOL
                                }
                            }
                        )
                        .session(session);
                }
            }

            await this.memberRepository
                .findOneAndUpdate(
                    { _id: senderMember._id },
                    {
                        $inc: {
                            lamportsEarned:
                                -sendAssetsDto.amount * LAMPORTS_PER_SOL
                        }
                    }
                )
                .session(session);

            this.apiService.sendNotification(
                `User ${account.username} sent ${
                    sendAssetsDto.amount
                }% of equity in ${org.name} to ${get(
                    recipient,
                    'nickname',
                    get(recipient, 'username', recipientAddress)
                )}\n\n${signature}\n\n${this.apiService.buildExplorerLink(
                    '/tx/' + signature
                )}`
            );
        });

        await session.endSession();
    }

    private async getUsersByQueryWithExactMatch(
        filter: UsersFilter
    ): Promise<User[]> {
        const query = {
            name: filter.name,
            nickname: filter.nickname
        };

        return this.userRepository.find(omitBy(query, isNil));
    }

    private async getUsersWithFilter(filter: UsersFilter): Promise<User[]> {
        const query = {};
        if (filter.name) {
            query['name'] = new RegExp(filter.name, 'i');
        }
        if (filter.nickname) {
            query['nickname'] = new RegExp(filter.nickname, 'i');
        }

        return this.userRepository.find(query);
    }

    _getTxnAmount(
        txn: ParsedTransactionWithMeta,
        associatedAddress: PublicKey
    ) {
        let amount = 0;
        let description = 'Received';
        const instructions = txn.transaction.message
            .instructions as ParsedInstruction[];
        for (const instruction of instructions) {
            if (amount) break;
            const source = get(instruction, 'parsed.info.source', '');
            const destination = get(instruction, 'parsed.info.destination', '');
            const isSent = isEqual(
                source.toString(),
                associatedAddress.toString()
            );
            const isReceived = isEqual(
                destination.toString(),
                associatedAddress.toString()
            );
            if (!isSent && !isReceived) {
                continue;
            }
            amount = toNumber(
                get(
                    instruction,
                    'parsed.info.amount',
                    get(instruction, 'parsed.info.tokenAmount.amount', 0)
                )
            );
            if (isSent) {
                amount = -amount;
                description = 'Sent';
            }
        }
        return { amount, description };
    }

    async _buildAssetHistory(
        account: AccountModel,
        associatedAddress: PublicKey,
        parsedTxns: ParsedTransactionWithMeta[]
    ): Promise<TxnHistoryItemDto[]> {
        const history: TxnHistoryItemDto[] = [];
        for (const txn of parsedTxns) {
            if (!isNil(txn.meta.err)) {
                continue;
            }
            let historyItems: TxnHistoryItemDto[] = [];
            const inAppEntity = await this._getEntityFromTxn(account, txn);
            if (isNil(inAppEntity)) {
                continue;
            }
            if (!isNil(inAppEntity.org)) {
                let isInvestor = false;
                const contribution = await this.contributionRepository
                    .findOne({ txnHash: { $in: txn.transaction.signatures } })
                    .populate([
                        { path: 'member', populate: { path: 'user' } },
                        { path: 'split.member', populate: { path: 'user' } }
                    ]);
                if (isNil(contribution)) {
                    continue;
                }
                contribution.split.forEach((split) => {
                    const item: TxnHistoryItemDto = {};
                    const contributionMember =
                        contribution.member as MemberDocument;
                    const contributionUser = defaultTo(
                        contributionMember.user as UserDocument,
                        contributionMember.orgUser as OrgDocument
                    );
                    const member = split.member as MemberDocument;
                    const memberUser = member.user as UserDocument;
                    const equityAllocation = get(
                        member,
                        'investorSettings.equityAllocation'
                    );
                    item.amount = split.amount;
                    item.img = memberUser.avatar;
                    item.addressOrUsername = memberUser.nickname;
                    if (
                        areObjectIdsEqual(member.user, account.id) ||
                        areObjectIdsEqual(member.orgUser, account.id)
                    ) {
                        let description: string;
                        if (member.role == Role.Investor) {
                            description = `Received for ${equityAllocation}% of equity allocation`;
                            item.img = defaultTo(
                                (contributionUser as UserDocument).avatar,
                                (contributionUser as OrgDocument).logo
                            );
                            item.addressOrUsername = defaultTo(
                                (contributionUser as UserDocument).nickname,
                                (contributionUser as OrgDocument).username
                            );
                            isInvestor = true;
                        } else {
                            description = 'Earned';
                            item.amount = contribution.lamportsEarned;
                        }
                        item.description = description;
                        historyItems = isInvestor
                            ? [item]
                            : [...historyItems, item];
                    } else if (!isInvestor) {
                        item.amount = -item.amount;
                        item.description = `Sent for ${equityAllocation}% of equity allocation`;
                        historyItems.unshift(item);
                    }
                });
            } else if (!isNil(inAppEntity.sale)) {
                const { amount } = this._getTxnAmount(txn, associatedAddress);
                const user = (
                    amount < 0
                        ? inAppEntity.sale.buyer
                        : inAppEntity.sale.seller
                ) as UserDocument | OrgDocument;
                const historyItem: TxnHistoryItemDto = {
                    amount,
                    addressOrUsername: get(
                        user,
                        'nickname',
                        get(user, 'username', '')
                    ),
                    img: get(user, 'avatar', get(user, 'logo', '')),
                    description: `${amount < 0 ? 'Sold' : 'Bought'} for $${
                        inAppEntity.sale.price
                    }`
                };
                historyItems.push(historyItem);
            } else {
                const historyItem: TxnHistoryItemDto = {
                    addressOrUsername: get(inAppEntity, 'username'),
                    img: get(inAppEntity, 'img')
                };
                const { amount, description } = this._getTxnAmount(
                    txn,
                    associatedAddress
                );
                historyItem.amount = amount;
                historyItem.description = description;
                historyItems.push(historyItem);
            }
            historyItems.forEach((item) => {
                item.processedAt = txn.blockTime * 1000;
            });
            history.push(...historyItems);
        }
        return history;
    }

    async _getEntityFromTxn(
        account: AccountModel,
        txn: ParsedTransactionWithMeta
    ): Promise<EntityFromTxnDto | null> {
        const payment = await this.paymentRepository
            .findOne({
                $or: [
                    {
                        'cpResult.signature': {
                            $in: txn.transaction.signatures
                        }
                    },
                    { txnHash: { $in: txn.transaction.signatures } }
                ]
            })
            .populate(['sale.org']);
        let sale: SaleOfferDocument;
        if (!isNil(payment) && payment.type === PaymentType.AssetsSell) {
            await this.saleOfferRepository.populateSeller(payment);
            await this.saleOfferRepository.populateBuyer(payment);
            sale = payment.sale;
        } else {
            sale = await this.saleOfferRepository.findOne({
                txnHash: { $in: txn.transaction.signatures }
            });
            if (!isNil(sale)) {
                await sale.populateSeller();
                await sale.populateBuyer();
            }
        }
        if (!isNil(sale)) {
            const buyer = sale.buyer as UserDocument | OrgDocument;
            return {
                username: get(buyer, 'nickname', get(buyer, 'username')),
                img: get(buyer, 'avatar', get(buyer, 'logo')),
                sale
            };
        }
        const instructions = txn.transaction.message.instructions;
        return instructions.reduce<Promise<EntityFromTxnDto | null>>(
            async (entity, instruction: ParsedInstruction) => {
                if (!isNil(await entity)) {
                    return entity;
                }
                const parsed = get(instruction, 'parsed');
                const authority = get(
                    parsed,
                    'info.authority',
                    get(parsed, 'info.mintAuthority', '')
                );
                const org = await this.orgRepository.findOne({
                    wallet: authority.toString()
                });
                if (!isNil(org)) {
                    return { username: org.username, img: org.logo, org };
                }
                const destination = get(parsed, 'info.destination', '');
                let accInfo: Account, owner: PublicKey;
                if (!isEmpty(destination)) {
                    accInfo = await this.apiService.getAccountInfo(
                        destination.toString()
                    );
                    owner = get(accInfo, 'owner');
                }
                if (isEqual(authority.toString(), account.wallet.toString())) {
                    const receiver = await this.userRepository.findOne({
                        wallet: owner.toString()
                    });
                    if (!isNil(receiver)) {
                        return {
                            username: receiver.nickname,
                            img: receiver.avatar
                        };
                    } else {
                        return { username: owner.toString() };
                    }
                }
                if (
                    !isNil(owner) &&
                    isEqual(owner.toString(), account.wallet.toString())
                ) {
                    const sender = await this.userRepository.findOne({
                        wallet: authority.toString()
                    });
                    if (!isNil(sender)) {
                        return {
                            username: sender.nickname,
                            img: sender.avatar,
                            from: sender
                        };
                    } else {
                        return {
                            username: authority.toString(),
                            from: authority.toString()
                        };
                    }
                }
            },
            null
        );
    }

    async generateToken(account: AccountModel) {
        const user = await this.getByUserId(account.user._id.toString());

        const payload = {
            userId: user._id
        };
        return {
            token: this.jwtService.sign(payload)
        };
    }
}
