import { Controller, Get, Query, Res } from '@nestjs/common';
import { SocialsService } from './socials.service';
import { Response } from 'express';

@Controller('socials')
export class SocialsController {
  constructor(private socialsService: SocialsService) {}

  @Get('twitter/follow')
  twitterFollow(@Query('wallet') wallet: string) {
    return this.socialsService.twitterFollow(wallet);
  }

  @Get('twitter/follow/check')
  twitterFollowCheck(@Query('wallet') wallet: string) {
    return this.socialsService.twitterFollowCheck(wallet);
  }

  @Get('twitter/callback')
  async twitterCallback(@Query() query: any, @Res() res: Response) {
    await this.socialsService.twitterCallback(query);
    res.redirect('https://airdrop.deplan.xyz');
  }
}
