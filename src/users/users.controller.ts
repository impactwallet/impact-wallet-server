import { Body, Controller, Get, Param, Post, Query, HttpStatus, UploadedFile, UseInterceptors } from '@nestjs/common';
import { HttpCode, Req, Headers } from '@nestjs/common/decorators';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from "@nestjs/platform-express";
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './schema/user.schema';
import { UsersService } from './users.service';
import { CreateUserResponseDto } from './dto/create-user.response.dto';
import { UsersFilter } from './dto/users.filter.dto';
import { SearchUserByNicknameDto } from './dto/search-user-by-nickname.dto';
import { Request } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { Member } from '../members/schema/member.schema';

@ApiTags('Users')
@Controller('users')
export class UsersController {

  constructor(private readonly userService: UsersService) {
  }

  @ApiOperation({ summary: 'Create user'})
  @ApiConsumes('form-data')
  @ApiResponse({ status: 201, type: CreateUserResponseDto  })
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
  getByUserId(@Param('id') id: string, @Req() req: Request) {
    return this.userService.getByUserId(id, req);
  }

  @ApiOperation({ summary: 'Get users memberships' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':userId/memberships')
  getUserMemberships(@Param('userId') userId: string, @Req() req: Request) {
    return this.userService.getUserMemberships(userId, req);
  }
}
