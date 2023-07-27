import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    UploadedFile,
    UseInterceptors,
    Headers
} from '@nestjs/common';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiResponse,
    ApiTags
} from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ApiMockHeader } from '../headers/mock';
import { OrgsServiceLite } from './orgs.service.lite';
import { CreateOrgDto } from './dto/create-org.dto';

@ApiTags('Orgs - Lite')
@Controller('lite/orgs')
export class OrgsLiteController {
    constructor(private readonly orgsLiteService: OrgsServiceLite) {}

    @ApiOperation({ summary: 'Create organization in lite mode' })
    @ApiResponse({ status: 201, type: Org })
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiBody({
        schema: {
            type: 'object',
            required: ['nickname', 'name', 'logo'],
            properties: {
                nickname: {
                    type: 'string',
                    example: 'vitcoin'
                },
                name: {
                    type: 'string',
                    example: 'Dmitry Vitko'
                },
                description: {
                    type: 'string',
                    example: 'Turn your time into equity'
                },
                link: {
                    type: 'string',
                    example: 'https://equitywallet.org'
                },
                settings: {
                    type: 'object',
                    properties: {
                        treasury: {
                            type: 'number',
                            example: 30
                        }
                    }
                },
                logo: {
                    description: `The image to upload (image/jpeg, image/png, image/tiff). Max size: 20MB`,
                    type: 'string',
                    format: 'binary'
                },
                member: {
                    type: 'object',
                    properties: {
                        occupation: {
                            type: 'string',
                            example: 'CEO',
                            description: 'Occupation in organization'
                        },
                        role: {
                            type: 'string',
                            example: 'Admin',
                            enum: ['Admin', 'Member', 'Investor'],
                            description: 'Role in organization'
                        },
                        impactRatio: {
                            type: 'number',
                            example: 1.5,
                            description: 'Impact ratio'
                        },
                        equity: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    example: 'Immediately',
                                    enum: ['Immediately', 'DuringPeriod']
                                },
                                period: {
                                    type: 'string',
                                    example: 'Days',
                                    enum: ['Days', 'Weeks', 'Months', 'Years']
                                }
                            }
                        },
                        compensation: {
                            type: 'object',
                            properties: {
                                amount: {
                                    type: 'number',
                                    example: 3000
                                },
                                type: {
                                    type: 'string',
                                    example: 'Immediately',
                                    enum: ['Immediately', 'DuringPeriod']
                                },
                                period: {
                                    type: 'string',
                                    example: 'Days',
                                    enum: ['Days', 'Weeks', 'Months', 'Years']
                                }
                            }
                        },
                        isAutoContributing: {
                            type: 'boolean',
                            example: true,
                            description: 'Auto contribution'
                        },
                        hoursPerWeek: {
                            type: 'number',
                            example: 40,
                            default: 40,
                            description: 'Hours per week',
                            maximum: 112
                        },
                        agreement: {
                            type: 'string',
                            example: 'agreement.pdf',
                            description: 'Work agreement'
                        },
                        user: {
                            type: 'string',
                            example: '0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47',
                            description: 'User id'
                        },
                        orgUser: {
                            type: 'string',
                            example: '49ad41f6-abc5-47c2-b8c9-a256d1203f8c',
                            description: 'Org user id'
                        },
                        investorSettings: {
                            type: 'object',
                            properties: {
                                investmentAmount: {
                                    type: 'number',
                                    example: 3000
                                },
                                equityAllocation: {
                                    type: 'number',
                                    example: 10
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('logo'))
    @ApiMockHeader('If true wallet and token creations are skipped')
    createOrg(
        @Body() createOrgDto: CreateOrgDto,
        @UploadedFile() logo: any,
        @Headers('mock') mock: string,
        @Req() req: Request
    ) {
        return this.orgsLiteService.createOrgLite(
            createOrgDto,
            logo,
            mock === 'true',
            req
        );
    }
}
