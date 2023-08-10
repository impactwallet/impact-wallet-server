import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly authService: AuthService,
  ) {}

  @ApiResponse({ status: 200 })
  @Post('candypay-webhook')
  createOrg(@Body() body: any, @Headers() headers: any) {
    return this.paymentService.handlePayment(headers, body);
  }

  @ApiResponse({ status: 200 })
  @Get(':paymentId')
  async getPayment(@Param('paymentId') paymentId: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.paymentService.getPaymentById(paymentId, { path: 'org' });
  }

  @ApiResponse({ status: 200 })
  @Post(':paymentId')
  async performPayment(
    @Param('paymentId') paymentId: string,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    try {
      return await this.paymentService.performPayment(paymentId, account);
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
