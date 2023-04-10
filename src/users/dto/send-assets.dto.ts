import { ApiProperty } from '@nestjs/swagger';

export class SendAssetsDto {

  @ApiProperty({ description: 'ID recipient' })
    recipientId: string;

  @ApiProperty({ description: 'Number of impact shares' })
    amount: number;
}