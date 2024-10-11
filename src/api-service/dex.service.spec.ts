import { Test, TestingModule } from '@nestjs/testing';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { encode } from 'bs58';
import { DexService } from './dex.service';
import { ApiService } from './api.service';

describe('DexService', () => {
  let service: DexService;
  let apiService: {
    getPK: jest.Mock;
    createTokenAccountInstruction: jest.Mock;
    createTransferInstructions: jest.Mock;
  };
  const swaperKeypair = Keypair.generate();
  const walletKeypair = Keypair.generate();

  beforeEach(async () => {
    process.env.ENV = 'DEV';
    process.env.FEE_PAYER = 'fee-payer';
    process.env.FEE_PAYER_PWD = 'pwd';
    process.env.USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    process.env.DEPLAN_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

    apiService = {
      getPK: jest.fn().mockResolvedValue(encode(swaperKeypair.secretKey)),
      createTokenAccountInstruction: jest
        .fn()
        .mockResolvedValue({ programId: 'create' }),
      createTransferInstructions: jest
        .fn()
        .mockResolvedValueOnce([{ programId: 'dpln-transfer' }])
        .mockResolvedValueOnce([{ programId: 'usdc-transfer' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DexService,
        { provide: ApiService, useValue: apiService },
      ],
    }).compile();

    service = module.get<DexService>(DexService);
  });

  describe('_deserializeInstruction', () => {
    it('builds a TransactionInstruction from serialized data', () => {
      const programId = Keypair.generate().publicKey.toBase58();
      const pubkey = Keypair.generate().publicKey.toBase58();

      const instruction = service._deserializeInstruction({
        programId,
        accounts: [{ pubkey, isSigner: true, isWritable: false }],
        data: Buffer.from('hello').toString('base64'),
      });

      expect(instruction).toBeInstanceOf(TransactionInstruction);
      expect(instruction.programId).toEqual(new PublicKey(programId));
      expect(instruction.keys[0].pubkey).toEqual(new PublicKey(pubkey));
      expect(instruction.data.toString()).toBe('hello');
    });
  });

  describe('_getSwapInstructionsDev', () => {
    it('returns setup and swap instructions for non-prod environments', async () => {
      const result = await service._getSwapInstructionsDev(
        encode(walletKeypair.secretKey),
        10,
        Keypair.generate().publicKey.toBase58(),
      );

      expect(apiService.getPK).toHaveBeenCalledWith('fee-payer', 'pwd');
      expect(apiService.createTokenAccountInstruction).toHaveBeenCalled();
      expect(result.setupInstructions).toHaveLength(1);
      expect(result.swapInstructions).toHaveLength(2);
      expect(result.addressLookupTableAccounts).toBeNull();
    });
  });
});
