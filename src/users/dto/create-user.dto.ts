import { ApiProperty } from "@nestjs/swagger"

export class CreateUserDto {
  @ApiProperty({ example: 'Dmitry', description: 'Nickname of user', required: true })
  readonly nickname: string;
  @ApiProperty({ example: 'Dmitry Vitko', description: 'Name of user', required: true })
  readonly name: string;
  @ApiProperty({ example: 'Profile picture', description: 'User photo', required: false })
    avatar?: string;
}