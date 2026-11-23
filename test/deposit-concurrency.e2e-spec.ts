import { Connection, createConnection, Types } from 'mongoose';
import { ApiService } from '../src/api-service/api.service';
import { DepositService } from '../src/deposit/deposit.service';
import { DepositStatus } from '../src/deposit/enum/deposit-status.enum';
import {
  Deposit,
  DepositDocument,
  DepositSchema,
} from '../src/deposit/schema/deposit.schema';
import { Org, OrgDocument, OrgSchema } from '../src/orgs/schema/org.schema';
import { User, UserSchema } from '../src/users/schema/user.schema';

describe('Concurrent deposit claim (MongoDB)', () => {
  let db: Connection;
  const databaseName = `impact_wallet_deposit_e2e_${new Types.ObjectId()}`;
  const originalRoot = process.env.ROOT_PUBKEY;
  const originalMint = process.env.CREDITS_MINT;

  beforeAll(async () => {
    db = createConnection(
      `mongodb://127.0.0.1:27028/${databaseName}?replicaSet=rs0&directConnection=true`,
      { serverSelectionTimeoutMS: 5000 },
    );
    await db.asPromise();
    process.env.ROOT_PUBKEY = 'test-root-wallet';
    process.env.CREDITS_MINT = 'test-credits-mint';
  });

  afterAll(async () => {
    if (originalRoot === undefined) delete process.env.ROOT_PUBKEY;
    else process.env.ROOT_PUBKEY = originalRoot;
    if (originalMint === undefined) delete process.env.CREDITS_MINT;
    else process.env.CREDITS_MINT = originalMint;
    try {
      if (db?.readyState === 1) await db.dropDatabase();
    } finally {
      await db?.close();
    }
  });

  it('allows only one handler to mint while the other observes Processing', async () => {
    const deposits = db.model<DepositDocument>(Deposit.name, DepositSchema);
    const orgs = db.model<OrgDocument>(Org.name, OrgSchema);
    const users = db.model(User.name, UserSchema);
    await Promise.all([deposits.init(), orgs.init(), users.init()]);
    const user = await users.create({
      nickname: 'alice',
      wallet: 'test-user-wallet',
    });
    // Seed only the treasury fields this flow needs; no external wallet setup.
    await orgs.collection.insertOne({
      username: 'test-root',
      name: 'Test root',
      wallet: 'test-root-wallet',
      password: 'test-root-password',
    });
    const deposit = await deposits.create({ amount: 100, user: user._id });
    expect(deposit.status).toBe(DepositStatus.Pending);

    let releaseMint: () => void;
    const mintGate = new Promise<void>((resolve) => {
      releaseMint = resolve;
    });
    const externalApi = {
      getPK: jest.fn().mockResolvedValue('test-root-key'),
      mintToken: jest.fn(async () => {
        await mintGate;
        return 'confirmed-mint-hash';
      }),
      sendNotification: jest.fn().mockResolvedValue(undefined),
      buildExplorerLink: jest.fn(
        (path: string) => `https://example.test${path}`,
      ),
    };
    // Real service instances and Mongoose models; only external effects are mocked.
    const first = new DepositService(
      db,
      deposits,
      orgs,
      externalApi as unknown as ApiService,
    );
    const second = new DepositService(
      db,
      deposits,
      orgs,
      externalApi as unknown as ApiService,
    );
    const calls = [
      first.handleDeposit(deposit.id, 100),
      second.handleDeposit(deposit.id, 100),
    ];
    // Attach handlers immediately so failures are collected even during cleanup.
    const completed = Promise.allSettled(calls);
    let timeout: ReturnType<typeof setTimeout>;
    try {
      // The loser must finish without waiting for the winner's external mint.
      // If both enter mint, fail within 5s and release both in finally.
      await Promise.race([
        Promise.race(calls),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error('Neither handler skipped the claimed deposit')),
            5000,
          );
        }),
      ]);
      const processing = await deposits.findById(deposit.id).lean();
      expect(processing.status).toBe(DepositStatus.Processing);
      expect(processing.txnHash).toBeUndefined();
      expect(externalApi.sendNotification).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timeout);
      releaseMint();
      await completed;
    }

    expect(await completed).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ]);
    expect(externalApi.mintToken).toHaveBeenCalledTimes(1);
    expect(externalApi.mintToken).toHaveBeenCalledWith(
      'test-credits-mint',
      'test-root-key',
      [{ wallet: 'test-user-wallet', amount: 100 }],
    );
    expect(externalApi.sendNotification).toHaveBeenCalledTimes(1);
    const saved = await deposits.findById(deposit.id).lean();
    expect(saved).toMatchObject({
      status: DepositStatus.Fulfilled,
      amount: 100,
      txnHash: 'confirmed-mint-hash',
    });
  });
});
