import { Body, Controller, Get, Param, Post, Query, HttpStatus, UploadedFile, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { HttpCode, Req, Headers, Res } from '@nestjs/common/decorators';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schema/user.schema';
import { UsersService } from './users.service';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { UsersFilter } from './dto/users.filter.dto';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { Request, Response } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { Member } from '../members/schema/member.schema';
import { Contribution } from '../contributions/schema/contribution.schema';
import { ContributionsService } from '../contributions/contributions.service';
import { ContributionsFilterDto } from '../contributions/dto/contributions-filter.dto';
import { SendAssetsDto } from 'src/users/dto/send-assets.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {

  constructor(
    private readonly userService: UsersService,
    private readonly contributionsService: ContributionsService,
  ) {
  }

  @ApiOperation({ summary: 'Create user' })
  @ApiConsumes('form-data')
  @ApiResponse({ status: 201, type: CreateUserResponseDto })
  @Post()
  @UseInterceptors(FileInterceptor('avatar'))
  @HttpCode(HttpStatus.CREATED)
  @ApiMockHeader('If true wallet creation is skipped')
  createUser(
    @Body() createUserDto: CreateUserDto,
    @UploadedFile() avatar,
    @Headers('mock') mock
  ): Promise<CreateUserResponseDto> {
    return this.userService.createUser(createUserDto, avatar, mock === 'true');
  }

  @ApiOperation({ summary: 'Get users by query' })
  @ApiResponse({ status: 200, type: [User] })
  @Get()
  getUserByQuery(@Query() query: UsersFilter, @Req() req: Request): Promise<User[]> {
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
    await this.userService.getUserFromToken(req);
    return this.userService.getByUserId(id);
  }

  @ApiOperation({ summary: 'Get users memberships' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':userId/memberships')
  getUserMemberships(@Param('userId') userId: string, @Req() req: Request) {
    return this.userService.getUserMemberships(userId, req);
  }

  @ApiOperation({ summary: 'Get users contributions' })
  @ApiResponse({ status: 200, type: [Contribution] })
  @Get(':userId/contributions')
  async getUserContributions(
    @Param('userId') userId: string,
    @Query(new ValidationPipe()) filter: ContributionsFilterDto,
    @Req() req: Request,
  ) {
    await this.userService.getUserFromToken(req);

    filter.userId = userId;

    return this.contributionsService.getContributions(filter);
  }

  @ApiOperation({ summary: 'Get users avatar' })
  @ApiResponse({ status: 200 })
  @Get('/avatar/:fileName')
  async getUserAvatar(
    @Param('fileName') fileName: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.userService.getUserFromToken(req);

    const data = await this.userService.getAvatar(fileName);
    res.writeHead(200, { 'content-type': 'image/*' });
    res.write(data.file, 'binary');
    res.end(null, 'binary');
  }

  @ApiOperation({ summary: 'Get users USDC balance' })
  @ApiResponse({ status: 200, type: Number })
  @Get('usdc/balance')
  async getUserBalance(
    @Req() req: Request
  ) {
    const user: User = await this.userService.getUserFromToken(req);

    return {
      balance: await this.userService.getUserBalance(user),
    };
  }

  @ApiOperation({ summary: 'Send USDC' })
  @ApiResponse({ status: 200 })
  @Get('usdc/send')
  async sendUsdc(
    @Body() sendAssetsDto: SendAssetsDto,
    @Req() req: Request
  ) {
    const user: UserDocument = await this.userService.getUserFromToken(req);

    return await this.userService.sendUsdc(user, sendAssetsDto);
  }

  @ApiOperation({ summary: 'Restore user' })
  @ApiResponse({ status: 200, type: CreateUserResponseDto })
  @Post(':secretLink/restore')
  @HttpCode(HttpStatus.OK)
  async restoreUser(
    @Param('secretLink') secretLink: string,
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
    const sender = await this.userService.getUserFromToken(req);

    return this.userService.sendAssets(sendAssetsDto, sender, orgId);
  }
}
