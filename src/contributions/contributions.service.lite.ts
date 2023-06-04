import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { get, isNil } from 'lodash';
import { ApiService } from '../api-service/api.service';
import { OrgsService } from '../orgs/orgs.service';
import { StartContributionLiteDto } from './dto/start-contribution.lite.dto';
import { UsersService } from '../users/users.service';
import { AccountModel } from '../auth/models/account.model';

@Injectable()
export class ContributionsServiceLite {
  constructor(
    private readonly apiService: ApiService,
    private readonly orgsService: OrgsService,
    private readonly userService: UsersService,
  ) { }

  async recordContribution(orgId: string, body: StartContributionLiteDto, account: AccountModel) {
    const org = await this.orgsService.getByOrgId(orgId, '+password');
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    const { memo } = body;

    try {
      const userPk = await this.apiService.getPK(account.wallet, await account.password);
      const orgPk = await this.apiService.getPK(org.wallet, org.password);
      const keys = [
        { pubKey: account.wallet, pk: userPk },
        { pubKey: org.wallet, pk: orgPk },
      ];
      const txnHash = await this.apiService.recordMemo(memo, keys);
      this.apiService.sendNotification(
        `New contribution from user ${account.user} was recorded for organisation ${org.username.toUpperCase()}:\n\n${txnHash}\n\n${this.apiService.buildExplorerLink('/tx/' + txnHash)}`
      );
      return txnHash;
    } catch (e) {
      throw new HttpException(e.message, get(e, 'response.status', 400), { cause: e });
    }
  }
}