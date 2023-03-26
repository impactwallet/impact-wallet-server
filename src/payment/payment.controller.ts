import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @ApiResponse({ status: 200 })
  @Post('candypay-webhook')
  createOrg(@Body() body: any, @Headers() headers: any) {
    return this.paymentService.updatePayment(headers, body);
  }
}