import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
const Agenda = require('agenda');
import { UsersService } from '../users/users.service';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly agenda;
  constructor(private readonly usersService: UsersService) {
    this.agenda = new Agenda({
      db: { address: process.env.MONGODB_URI, collection: 'jobs' },
    });
  }

  formatFrequency(freq: string): string {
    return freq.replace(/(\d)([a-zA-Z]+)/, '$1 $2');
  }

  async onModuleInit() {
    const isJobEnable = process.env.BONUS_RETURN_ENABLED || false;
    this.agenda.define('Refund of unused bonuses USDC', async (job) => {
      await this.usersService.returnBonusUSDC();
    });

    await this.agenda.start();
    const frequency =
      this.formatFrequency(process.env.BONUS_RETURN_FREQUENCY) || '1minute';
    if (isJobEnable) {
      await this.agenda.every(frequency, 'Refund of unused bonuses USDC');
    }
  }

  async onModuleDestroy() {
    await this.agenda.stop();
  }
}
