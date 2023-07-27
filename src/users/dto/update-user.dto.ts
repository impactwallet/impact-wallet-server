import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiProperty({
        example: 'vitcoin',
        description: 'Nickname of user',
        required: false
    })
    readonly nickname?: string;
    @ApiProperty({
        example: 'Dmitry Vitko',
        description: 'Name of user',
        required: false
    })
    readonly name?: string;
    @ApiProperty({
        example: 'Profile picture',
        description: 'User photo',
        required: false
    })
    readonly avatar?: string;
}
