import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { get, isNil } from 'lodash';
import { ApiService } from '../api-service/api.service';
import { OrgsService } from '../orgs/orgs.service';
import { StartContributionLiteDto } from './dto/start-contribution.lite.dto';
import { UserDocument } from '../users/schema/user.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class ContributionsServiceLite {
  constructor(
    private readonly apiService: ApiService,
    private readonly orgsService: OrgsService,
    private readonly userService: UsersService,
  ) { }

  async recordContribution(orgId: string, body: StartContributionLiteDto, user: UserDocument) {
    const org = await this.orgsService.getByOrgId(orgId, '+password');
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    user = await this.userService.getByUserId(user._id.toString(), '+password');
    const { memo } = body;

    try {
      const userPk = await this.apiService.getPK(user.wallet, user.password);
      const orgPk = await this.apiService.getPK(org.wallet, org.password);
      const keys = [
        { pubKey: user.wallet, pk: userPk },
        { pubKey: org.wallet, pk: orgPk },
      ];
      const txnHash = await this.apiService.recordMemo(memo, keys);
      this.apiService.sendNotification(
        `New contribution from user ${user.nickname} was recorded for organisation ${org.username.toUpperCase()}:\n\n${txnHash}\n\n${this.apiService.buildExplorerLink('/tx/' + txnHash)}`
      );
      return txnHash;
    } catch (e) {
      throw new HttpException(e.message, get(e, 'response.status', 400), { cause: e });
    }
  }
}