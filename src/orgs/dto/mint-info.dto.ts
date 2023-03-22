import { MintStatus } from '../enum/mint-status';

export class MintInfoDto {
  mint: string;
  mintError: string;
  mintStatus: MintStatus;
}