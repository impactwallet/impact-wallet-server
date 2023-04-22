import { MintStatus } from '../enum/mint-status.enum';

export class MintInfoDto {
  mint: string;
  mintError: string;
  mintStatus: MintStatus;
}