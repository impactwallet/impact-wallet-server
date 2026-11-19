import { Connection, createConnection, Types } from 'mongoose';
import * as moment from 'moment';
import { quarterlyRevenuePipeline } from '../src/orgs/aggregation';

describe('Quarterly revenue aggregation (MongoDB)', () => {
  let db: Connection;
  const collectionName = `quarterly_revenue_e2e_${new Types.ObjectId()}`;

  beforeAll(async () => {
    db = createConnection(
      'mongodb://127.0.0.1:27028/impact_wallet_e2e?replicaSet=rs0&directConnection=true',
      { serverSelectionTimeoutMS: 5000 },
    );
    await db.asPromise();
    await db.createCollection(collectionName);
  });

  beforeEach(async () => {
    // Keep fixtures inside the rolling window regardless of the actual date.
    // Mock only Moment's clock; MongoDB's network timers remain real.
    jest.spyOn(moment, 'now').mockReturnValue(Date.parse('2026-11-17T12:00:00Z'));
    await db.collection(collectionName).deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      if (db?.readyState === 1) {
        await db.collection(collectionName).drop();
      }
    } finally {
      await db?.close();
    }
  });

  it('sums January through March into Q1 and keeps April in Q2', async () => {
    await db.collection(collectionName).insertMany([
      { amount: 40, updatedAt: new Date('2026-04-01T00:00:00Z') },
      { amount: 20, updatedAt: new Date('2026-02-15T12:00:00Z') },
      { amount: 30, updatedAt: new Date('2026-03-31T23:59:59.999Z') },
      { amount: 10, updatedAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const result = await db
      .collection(collectionName)
      .aggregate(quarterlyRevenuePipeline())
      .toArray();

    // Preserve the API's date/revenue shape: date is the quarter's first day (UTC).
    expect(result).toEqual([
      { date: '2026-01-01', revenue: 60 },
      { date: '2026-04-01', revenue: 40 },
    ]);
  });

  it('includes the UTC window boundary and excludes payments before it', async () => {
    // With the clock fixed to November 2026, nine quarters back starts July 2024.
    // Run Jest separately with TZ=UTC and TZ=Europe/Ljubljana to check both zones.
    await db.collection(collectionName).insertMany([
      { amount: 100, updatedAt: new Date('2024-06-30T23:59:59.999Z') },
      { amount: 20, updatedAt: new Date('2024-07-01T00:00:00.000Z') },
      { amount: 30, updatedAt: new Date('2024-07-01T00:00:00.001Z') },
    ]);

    const result = await db
      .collection(collectionName)
      .aggregate(quarterlyRevenuePipeline())
      .toArray();

    expect(result).toEqual([{ date: '2024-07-01', revenue: 50 }]);
  });

  it('separates December and January and does not merge Q1 across years', async () => {
    await db.collection(collectionName).insertMany([
      { amount: 30, updatedAt: new Date('2026-01-01T00:00:00Z') },
      { amount: 20, updatedAt: new Date('2025-12-31T23:59:59.999Z') },
      { amount: 10, updatedAt: new Date('2025-01-01T00:00:00Z') },
    ]);

    const result = await db
      .collection(collectionName)
      .aggregate(quarterlyRevenuePipeline())
      .toArray();

    expect(result).toEqual([
      { date: '2025-01-01', revenue: 10 },
      { date: '2025-10-01', revenue: 20 },
      { date: '2026-01-01', revenue: 30 },
    ]);
  });
});
