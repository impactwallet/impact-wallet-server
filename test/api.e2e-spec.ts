import { JwtService } from '@nestjs/jwt';
import { createConnection, Connection, Types } from 'mongoose';
import * as request from 'supertest';

// Fixed local endpoints deliberately target only docker-compose.test.yml.
const api = request('http://127.0.0.1:19898');
const jwt = new JwtService({ secret: 'integration-test-only' });

describe('Containerized API (HTTP + MongoDB)', () => {
  let db: Connection;
  const userId = new Types.ObjectId();
  const nickname = `e2e-${userId}`;

  beforeAll(async () => {
    db = createConnection(
      'mongodb://127.0.0.1:27028/impact_wallet_e2e?replicaSet=rs0&directConnection=true',
      { serverSelectionTimeoutMS: 5000 },
    );
    await db.asPromise();
    await db.collection('users').insertOne({
      _id: userId,
      nickname,
      name: 'Integration user',
      wallet: 'test-wallet',
      password: 'must-not-leak',
      secretLink: 'must-not-leak',
    });
  });

  afterAll(async () => {
    try {
      if (db?.readyState === 1) {
        await db.collection('users').deleteOne({ _id: userId });
      }
    } finally {
      await db?.close();
    }
  });

  it('serves the API schema from the runtime image', async () => {
    const { body } = await api.get('/docs-json').expect(200);
    expect(body.info.title).toBe('Equity Wallet');
    expect(body.paths['/auth/me']).toBeDefined();
  });

  it('rejects an unauthenticated HTTP request', async () => {
    await api.get('/auth/me').expect(401);
  });

  it('resolves a signed JWT against MongoDB without exposing secrets', async () => {
    const token = jwt.sign({ userId: userId.toHexString() });
    const { body } = await api
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(body).toMatchObject({
      id: userId.toHexString(),
      username: nickname,
    });
    expect(body.user.password).toBeUndefined();
    expect(body.user.secretLink).toBeUndefined();
  });

  it('rejects a valid token for a nonexistent user', async () => {
    const token = jwt.sign({ userId: new Types.ObjectId().toHexString() });
    await api
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects an unsigned Stripe webhook before processing a deposit', async () => {
    await api
      .post('/payment/stripe-webhook')
      .send({ type: 'payment_intent.succeeded' })
      .expect(400);
  });

  it('validates merchant webhook input before invoking integrations', async () => {
    const { body } = await api
      .post('/payment/merchant-webhook')
      .send({ amount: 'invalid' })
      .expect(400);
    expect(body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('walletAddress'),
        expect.stringContaining('amount'),
      ]),
    );
  });

  it('supports rollback in the MongoDB replica set', async () => {
    const session = await db.startSession();
    const rolledBackId = new Types.ObjectId();
    const failure = new Error('Intentional rollback');
    try {
      await expect(
        session.withTransaction(async () => {
          await db
            .collection('users')
            .insertOne(
              { _id: rolledBackId, nickname: `rollback-${rolledBackId}` },
              { session },
            );
          throw failure;
        }),
      ).rejects.toThrow(failure);
      expect(
        await db.collection('users').findOne({ _id: rolledBackId }),
      ).toBeNull();
    } finally {
      await session.endSession();
    }
  });
});
