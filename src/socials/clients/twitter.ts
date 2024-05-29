import { auth, Client } from 'twitter-api-sdk';

class TwitterClient {
  private authClient: auth.OAuth2User;
  private client: Client;
  private authConfig: auth.OAuth2UserOptions = {
    client_id: process.env.TWITTER_CLIENT_ID as string,
    client_secret: process.env.TWITTER_CLIENT_SECRET as string,
    callback: `${process.env.SERVER_URL}/socials/twitter/callback`,
    scopes: [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access',
      'follows.write',
      'follows.read',
    ],
  };

  constructor() {
    this.authClient = new auth.OAuth2User(this.authConfig);
    this.client = new Client(this.authClient);
  }

  getMyAccount = async () => {
    try {
      const resp = await this.client.users.findMyUser();
      const myId = resp.data?.id || '';
      const myName = resp.data?.name || '';
      return {
        myId,
        myName,
      };
    } catch (error) {
      console.log('error myId --->', JSON.stringify(error));
      throw error;
    }
  };

  followDeplan = async (myId: string) => {
    try {
      const resp = await this.client.users.usersIdFollow(myId, {
        target_user_id: process.env.DEPLAN_TWITTER_ID,
      });
      return resp;
    } catch (error) {
      console.log('error followDeplan --->', JSON.stringify(error));
      throw error;
    }
  };

  generateAuthUrl = async (wallet: string) => {
    try {
      const url = this.authClient.generateAuthURL({
        state: wallet,
        code_challenge_method: 's256',
      });

      return url;
    } catch (error) {
      console.log('error generateAuthUrl --->', JSON.stringify(error));
      throw error;
    }
  };

  requestAccessToken = async (code: string, state: string) => {
    console.log('callback', code, state);

    try {
      await this.authClient.requestAccessToken(code as string);
    } catch (error) {
      console.log('error requestAccessToken --->', JSON.stringify(error));
      throw error;
    }
  };

  checkIsFollowing = async (userId: string) => {
    try {
      const resp = await this.client.users.usersIdFollowing(userId);
      return (
        resp.data?.find(
          (userData) => userData.id === process.env.DEPLAN_TWITTER_ID,
        ) || false
      );
    } catch (error) {
      console.log('error checkIsFollowing --->', JSON.stringify(error));
      throw error;
    }
  };

  revokeAccessToken = async () => {
    try {
      await this.authClient.revokeAccessToken();
    } catch (error) {
      console.log('error revokeAccessToken --->', JSON.stringify(error));
      throw error;
    }
  };

  async createTweet(text: string) {
    try {
      const result = await this.client.tweets.createTweet({
        text,
      });
      return result;
    } catch (error) {
      console.log('error createTweet --->', JSON.stringify(error));
      throw error;
    }
  }
}

export default TwitterClient;
