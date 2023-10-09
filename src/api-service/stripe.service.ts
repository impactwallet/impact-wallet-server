import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  stripe = new Stripe(process.env.STRIPE_SK, null);

  createPaymentLink(params: Stripe.PaymentLinkCreateParams) {
    return this.stripe.paymentLinks.create(params);
  }

  constructEvent(body: any, sig: string) {
    return this.stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WHSEC,
    );
  }
}
