import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import TwitterClient from './clients/twitter';
import { InjectModel } from '@nestjs/mongoose';
import {
  WalletSocial,
  WalletSocialDocument,
} from './schema/wallet-social.schema';
import { Model } from 'mongoose';
import { SocialName } from './enum/social-name.enum';
import { get, isNil } from 'lodash';
import * as moment from 'moment';

@Injectable()
export class SocialsService {
  _twitterClients: Map<string, TwitterClient> = new Map();

  constructor(
    @InjectModel(WalletSocial.name)
    private walletSocialModel: Model<WalletSocialDocument>,
  ) {}

  getTwitterClient(wallet: string) {
    let twitterClient = this._twitterClients.get(wallet);
    if (isNil(twitterClient)) {
      twitterClient = new TwitterClient();
      this._twitterClients.set(wallet, twitterClient);
    }
    return twitterClient;
  }

  async removeTwitterClient(wallet: string) {
    const twitterClient = this.getTwitterClient(wallet);
    if (isNil(twitterClient)) {
      return;
    }
    await twitterClient.revokeAccessToken();
    this._twitterClients.delete(wallet);
  }

  twitterFollow(wallet: string) {
    return this.getTwitterClient(wallet).generateAuthUrl(wallet as string);
  }

  async twitterFollowCheck(wallet: string) {
    const walletSocial = await this.walletSocialModel.findOne({
      wallet,
      socialName: SocialName.twitter,
    });
    const updatedAt = get(walletSocial, 'updatedAt');
    const updatedAtMoment = moment.utc(updatedAt);
    const diff = moment.utc().diff(updatedAtMoment, 'days');
    const isFollowing = get(walletSocial, 'isFollowing', false);
    if (!isFollowing || diff > 3) {
      throw new HttpException('Not following', HttpStatus.I_AM_A_TEAPOT);
    }
    return { isFollowing };
  }

  async twitterCallback(query: any) {
    const { code = '', state: wallet } = query;
    await this.getTwitterClient(wallet).requestAccessToken(
      code as string,
      wallet as string,
    );

    const { myId, myName } = await this.getTwitterClient(wallet).getMyAccount();
    const { data, errors } = await this.getTwitterClient(wallet).followDeplan(
      myId,
    );

    if (errors) {
      throw new Error(JSON.stringify(errors));
    }

    try {
      await this.getTwitterClient(wallet).createTweet(
        'DePlan is the new plan @DePlan_xyz',
      );
    } catch (e) {}

    await this.walletSocialModel.findOneAndUpdate(
      { wallet },
      {
        $set: {
          socialUserId: myId,
          socialUserName: myName,
          socialName: SocialName.twitter,
          isFollowing: data?.following,
        },
      },
      { upsert: true },
    );

    await this.removeTwitterClient(wallet);
  }
}
