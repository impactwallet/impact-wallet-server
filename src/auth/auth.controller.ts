import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Get currently logged in user' })
  @ApiResponse({ status: 200, description: 'Currently logged in user' })
  @Get('me')
  getUserFromToken(@Req() req: Request) {
    return this.authService.getAccountFromToken(req);
  }
}