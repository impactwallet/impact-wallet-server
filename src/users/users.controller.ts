import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Put,
  ValidationPipe,
} from '@nestjs/common';
import { HttpCode, Req, Headers, Res } from '@nestjs/common/decorators';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { Member } from '../members/schema/member.schema';
import { SendUsdcDto } from './dto/send-usdc.dto';
import { TxnHistoryItemDto } from '../common/dto/txn-history-item.dto';
import { AuthService } from '../auth/auth.service';
import { DeleteAvatarsRequestDto } from './dto/delete-avatars.request.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreditsWithdrawDto } from './dto/credits-withdraw.dto';
import { CreditsBurnDto } from './dto/credits-burn.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { SendAssetsDto } from './dto/send-assets.dto';
import { UsersFilter } from './dto/users.filter.dto';
import { User } from './schema/user.schema';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly userService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @ApiOperation({ summary: 'Create user' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nickname', 'name'],
      properties: {
        nickname: {
          type: 'string',
          example: 'vitcoin',
        },
        name: {
          type: 'string',
          example: 'Dmitry Vitko',
        },
        file: {
          description: `The image to upload (image/jpeg, image/png, image/tiff). Max size: 20MB`,
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, type: CreateUserResponseDto })
  @Post()
  @UseInterceptors(FileInterceptor('avatar'))
  @HttpCode(HttpStatus.CREATED)
  @ApiMockHeader('If true wallet creation is skipped')
  createUser(
    @Body() createUserDto: CreateUserDto,
    @UploadedFile() avatar,
    @Headers('mock') mock,
  ): Promise<CreateUserResponseDto> {
    return this.userService.createUser(createUserDto, avatar, mock === 'true');
  }

  @ApiOperation({ summary: 'Upload avatar' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          description: `The image to upload (image/jpeg, image/png, image/tiff). Max size: 20MB`,
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200 })
  @Post('/upload-avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  @HttpCode(HttpStatus.OK)
  async uploadAvatar(
    @UploadedFile() avatar,
    @Req() req: Request,
  ): Promise<string> {
    await this.authService.getAccountFromToken(req);
    return this.userService.uploadAvatar(avatar);
  }

  @ApiOperation({ summary: 'Delete avatar' })
  @ApiResponse({ status: 200 })
  @Post('/delete-avatars')
  @HttpCode(HttpStatus.OK)
  async deleteAvatar(
    @Body() deleteAvatarsDto: DeleteAvatarsRequestDto,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.userService.deleteAvatar(deleteAvatarsDto.fileName);
  }

  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, type: User })
  @Put('/update')
  @HttpCode(HttpStatus.OK)
  async updateUser(@Body() updateUserDto: UpdateUserDto, @Req() req: Request) {
    const account = await this.authService.getAccountFromToken(req);
    return this.userService.updateUser(updateUserDto, account);
  }

  @ApiOperation({ summary: 'Get users by query' })
  @ApiResponse({ status: 200, type: [User] })
  @Get()
  getUserByQuery(
    @Query() query: UsersFilter,
    @Req() req: Request,
  ): Promise<User[]> {
    return this.userService.getUsersByQuery(query, req);
  }

  @ApiOperation({ summary: 'Check if user exist' })
  @ApiResponse({ status: 200, type: String })
  @Post('/exists')
  getUserByNickName(@Body() searchUserByNicknameDto: SearchUserByNicknameDto) {
    return this.userService.userExist(searchUserByNicknameDto);
  }

  @ApiOperation({ summary: 'Get user by id' })
  @ApiResponse({ status: 200, type: User })
  @Get(':id')
  async getByUserId(@Param('id') id: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.userService.getByUserId(id);
  }

  @ApiOperation({ summary: 'Get users memberships' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':userId/memberships')
  getUserMemberships(@Param('userId') userId: string, @Req() req: Request) {
    return this.userService.getUserMemberships(userId, req);
  }

  @ApiOperation({ summary: 'Get users avatar' })
  @ApiResponse({ status: 200 })
  @Get('/avatar/:fileName')
  async getUserAvatar(
    @Param('fileName') fileName: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.authService.getAccountFromToken(req);

    const data = await this.userService.getAvatar(fileName);
    res.writeHead(200, { 'content-type': 'image/*' });
    res.write(data.file, 'binary');
    res.end(null, 'binary');
  }

  @ApiOperation({ summary: 'Get users Credit$ balance' })
  @ApiResponse({ status: 200, type: Number })
  @Get('usdc/balance')
  async getUserBalance(@Req() req: Request) {
    const account = await this.authService.getAccountFromToken(req);

    return {
      balance: await this.userService.getUserBalance(account),
    };
  }

  @ApiOperation({ summary: 'Send Credit$' })
  @ApiResponse({ status: 200 })
  @Post('usdc/send')
  @HttpCode(HttpStatus.OK)
  async sendUsdc(@Body() sendUsdcDto: SendUsdcDto, @Req() req: Request) {
    const account = await this.authService.getAccountFromToken(req);

    return this.userService.sendUsdc(account, sendUsdcDto);
  }

  @ApiOperation({ summary: 'Withdraw Credit$' })
  @ApiResponse({ status: 200 })
  @Post('credits/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawCredits(
    @Body(new ValidationPipe()) body: CreditsWithdrawDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);

    return this.userService.withdrawCredits(account, body);
  }

  @ApiOperation({ summary: 'Burn Credit$' })
  @ApiResponse({ status: 200 })
  @Post('credits/burn')
  @HttpCode(HttpStatus.OK)
  async burnCredits(
    @Body(new ValidationPipe()) body: CreditsBurnDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);

    return this.userService.burnCredits(account, body);
  }

  @ApiOperation({ summary: 'Restore user' })
  @ApiResponse({ status: 200, type: CreateUserResponseDto })
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  async restoreUser(
    @Body('secretLink') secretLink: string,
  ): Promise<CreateUserResponseDto> {
    return this.userService.restoreUser(secretLink);
  }

  @ApiOperation({ summary: 'Send Assets' })
  @ApiResponse({ status: 200 })
  @Post('assets/:orgId/send')
  @HttpCode(HttpStatus.OK)
  async sendAsset(
    @Param('orgId') orgId: string,
    @Body() sendAssetsDto: SendAssetsDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);

    return this.userService.sendAssets(sendAssetsDto, account, orgId);
  }

  @ApiOperation({ summary: 'Get users asset transactions history' })
  @ApiResponse({ status: 200, type: TxnHistoryItemDto })
  @Get('assets/:orgId/history')
  async getUserAssetHistory(
    @Param('orgId') orgId: string,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);

    return this.userService.getUserAssetHistory(account, orgId);
  }

  @ApiOperation({ summary: 'Login with token' })
  @ApiResponse({ status: 200 })
  @Post('/login')
  async loginWithToken(@Req() req: Request) {
    const account = await this.authService.getAccountFromToken(req);
    return this.userService.generateToken(account);
  }
}
