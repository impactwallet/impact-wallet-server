import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  stripe = new Stripe(process.env.STRIPE_SK, null);

  createPaymentLink(params: Stripe.PaymentLinkCreateParams) {
    return this.stripe.paymentLinks.create(params);
  }

  createProduct(params: Stripe.ProductCreateParams) {
    return this.stripe.products.create(params);
  }

  deleteProduct(productId: string) {
    return this.stripe.products.del(productId);
  }

  updateProduct(productId: string, params: Stripe.ProductUpdateParams) {
    return this.stripe.products.update(productId, params);
  }

  createPrice(params: Stripe.PriceCreateParams) {
    return this.stripe.prices.create(params);
  }

  updatePrice(priceId: string, params: Stripe.PriceUpdateParams) {
    return this.stripe.prices.update(priceId, params);
  }

  constructEvent(body: any, sig: string) {
    return this.stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WHSEC,
    );
  }
}
