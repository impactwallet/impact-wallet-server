import { StripeService } from './stripe.service';

jest.mock('stripe', () => {
  const stripeMock = {
    paymentLinks: { create: jest.fn().mockResolvedValue({ url: 'https://stripe.test' }) },
    products: {
      create: jest.fn().mockResolvedValue({ id: 'prod_1' }),
      del: jest.fn().mockResolvedValue({ deleted: true }),
      update: jest.fn().mockResolvedValue({ id: 'prod_1' }),
    },
    prices: {
      create: jest.fn().mockResolvedValue({ id: 'price_1' }),
      update: jest.fn().mockResolvedValue({ id: 'price_1' }),
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({ type: 'checkout.session.completed' }),
    },
  };

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => stripeMock),
  };
});

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(() => {
    process.env.STRIPE_SK = 'sk_test';
    process.env.STRIPE_WHSEC = 'whsec_test';
    service = new StripeService();
  });

  it('creates payment links via the stripe sdk', async () => {
    const params = { line_items: [], metadata: { depositId: '1' } };

    await expect(service.createPaymentLink(params as any)).resolves.toEqual({
      url: 'https://stripe.test',
    });
    expect(service.stripe.paymentLinks.create).toHaveBeenCalledWith(params);
  });

  it('creates and updates products', async () => {
    await service.createProduct({ name: 'Credits' } as any);
    await service.updateProduct('prod_1', { name: 'Credits Plus' } as any);
    await service.deleteProduct('prod_1');

    expect(service.stripe.products.create).toHaveBeenCalled();
    expect(service.stripe.products.update).toHaveBeenCalled();
    expect(service.stripe.products.del).toHaveBeenCalledWith('prod_1');
  });

  it('constructs webhook events with the configured secret', () => {
    const event = service.constructEvent('{}', 'sig');

    expect(service.stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      '{}',
      'sig',
      'whsec_test',
    );
    expect(event).toEqual({ type: 'checkout.session.completed' });
  });
});
