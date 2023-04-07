import { ApiProperty } from '@nestjs/swagger';

export class CreateUserResponseDto {
  @ApiProperty({ example: '0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47', description: 'SecretLink for recovery account' })
    secretLink: string;
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRG1pdHJpeSIsIm5pY2tuYW1lIjoiRG1pdHJpeTE0Iiwib3JncyI6W3sibmFtZSI6IkltcGFjdC1XYWxsZXQiLCJkZXNjcmlwdGlvbiI6IlR1cm4geW91ciB0aW1lIGludG8gZXF1aXR5IiwiX2lkIjoiNjQwNmYwMDNiMjRhZTNhZjBhZDFmMzAyIiwiX192IjowfV0sIndhbGxldCI6InVVdHN2NmNGendFTHhzekhNQU1Lb244eEFQZzZ3QUNpV0RWelA0NVo1M28iLCJpYXQiOjE2NzgxOTY1OTF9._TMMjXvrfSgztU3qafN7M-oKZR_8nXArWalseGk3qqk'
    , description: 'Organization id' })
    token: string;

}