import { Body, Controller, Get, Post, Query, Req, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { TxnHistoryItemDto } from '../common/dto/txn-history-item.dto';
import { AuthService } from '../auth/auth.service';
import { AccountService } from './account.service';
import { TransactionHistoryPaginationDto } from './dto/transaction-history-pagination.dto';

@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
  ) {}

  @ApiOperation({ summary: 'Get accounts USDC transactions history' })
  @ApiResponse({ status: 200, type: TxnHistoryItemDto })
  @Get('usdc/history')
  async getUserUsdcHistory(
    @Req() req: Request,
    @Query(new ValidationPipe({ transform: true })) query: TransactionHistoryPaginationDto,
  ) {
    const account = await this.authService.getAccountFromToken(req);

    return this.accountService.getUsdcHistory(account, query);
  }
}
