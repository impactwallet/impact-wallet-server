import { ApiProperty } from '@nestjs/swagger';

export class DeleteAvatarsRequestDto {
    @ApiProperty({
        example: [
            '08951481-7bd1-4393-8180-3597f28f6cb0.jpg',
            '08bf3634-e1d7-4620-9011-333744661ec6.jpg'
        ],
        description: 'Photos user profile'
    })
    fileName: string[];
}
