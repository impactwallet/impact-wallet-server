import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  Headers,
  NotFoundException,
  ValidationPipe,
  Res,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrgsService } from './orgs.service';
import { CreateOrgDto, OrgSettingsDto } from './dto/create-org.dto';
import { OrgsFilter } from './dto/orgs.filter.dto';
import { MemberDto } from 'src/members/dto/members.dto';
import { Member } from 'src/members/schema/member.schema';
import { Request, Response } from 'express';
import { OrgUsernameFilter } from './dto/org-username.filter.dto';
import { ApiMockHeader } from '../headers/mock';
import { isNil } from 'lodash';
import { MemberEquityDto } from '../members/dto/member-equity.dto';
import { Payment } from '../payment/schema/payment.schema';
import { ReceivePaymentDto } from '../payment/dto/receive-payment.dto';
import { PaymentService } from '../payment/payment.service';
import { SendUsdcDto } from '../users/dto/send-usdc.dto';
import { AuthService } from '../auth/auth.service';
import { UpdateOrgDto } from './dto/update-org.dto';
import { DeleteAvatarsRequestDto } from '../users/dto/delete-avatars.request.dto';
import { User } from '../users/schema/user.schema';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { DeleteLogosRequestDto } from './dto/delete-logos.request.dto';
import { MembersFilterDto } from '../members/dto/members.filter.dto';
import { OrgRevenueFilterDto } from './dto/org-revenue.filter.dto';
import { OrgSplitDto } from './dto/org-split.dto';

@ApiTags('Orgs')
@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly orgsService: OrgsService,
    private readonly authService: AuthService,
    private readonly paymentService: PaymentService,
  ) {}

  @ApiOperation({ summary: 'Check if an organization exists' })
  @ApiResponse({ status: 200, description: 'Organization exists' })
  @ApiResponse({ status: 404, description: 'Organization does not exist' })
  @Get('username')
  async findOrgByUsername(
    @Query() query: OrgUsernameFilter,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.findOrgByUsername(query);
  }

  @ApiOperation({ summary: 'Create organization' })
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
          example: 'vitcoin',
        },
        name: {
          type: 'string',
          example: 'Dmitry Vitko',
        },
        description: {
          type: 'string',
          example: 'Turn your time into equity',
        },
        link: {
          type: 'string',
          example: 'https://equitywallet.org',
        },
        settings: {
          type: 'object',
          properties: {
            treasury: {
              type: 'number',
              example: 30,
            },
          },
        },
        logo: {
          description: `The image to upload (image/jpeg, image/png, image/tiff). Max size: 20MB`,
          type: 'string',
          format: 'binary',
        },
        member: {
          type: 'object',
          properties: {
            occupation: {
              type: 'string',
              example: 'CEO',
              description: 'Occupation in organization',
            },
            role: {
              type: 'string',
              example: 'Admin',
              enum: ['Admin', 'Member', 'Investor'],
              description: 'Role in organization',
            },
            impactRatio: {
              type: 'number',
              example: 1.5,
              description: 'Impact ratio',
            },
            equity: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  example: 'Immediately',
                  enum: ['Immediately', 'DuringPeriod'],
                },
                period: {
                  type: 'string',
                  example: 'Days',
                  enum: ['Days', 'Weeks', 'Months', 'Years'],
                },
              },
            },
            compensation: {
              type: 'object',
              properties: {
                amount: {
                  type: 'number',
                  example: 3000,
                },
                type: {
                  type: 'string',
                  example: 'Immediately',
                  enum: ['Immediately', 'DuringPeriod'],
                },
                period: {
                  type: 'string',
                  example: 'Days',
                  enum: ['Days', 'Weeks', 'Months', 'Years'],
                },
              },
            },
            isAutoContributing: {
              type: 'boolean',
              example: true,
              description: 'Auto contribution',
            },
            hoursPerWeek: {
              type: 'number',
              example: 40,
              default: 40,
              description: 'Hours per week',
              maximum: 112,
            },
            agreement: {
              type: 'string',
              example: 'agreement.pdf',
              description: 'Work agreement',
            },
            user: {
              type: 'string',
              example: '0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47',
              description: 'User id',
            },
            orgUser: {
              type: 'string',
              example: '49ad41f6-abc5-47c2-b8c9-a256d1203f8c',
              description: 'Org user id',
            },
            investorSettings: {
              type: 'object',
              properties: {
                investmentAmount: {
                  type: 'number',
                  example: 3000,
                },
                equityAllocation: {
                  type: 'number',
                  example: 10,
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  @ApiMockHeader('If true wallet and token creations are skipped')
  createOrg(
    @Body() createOrgDto: CreateOrgDto,
    @UploadedFile() logo: any,
    @Headers('mock') mock: string,
    @Req() req: Request,
  ) {
    return this.orgsService.createOrg(createOrgDto, logo, mock === 'true', req);
  }

  @ApiOperation({ summary: 'Get organizations' })
  @ApiResponse({ status: 200, type: [Org] })
  @Get()
  getOrgsByQuery(@Query() query: OrgsFilter, @Req() req: Request) {
    return this.orgsService.getOrgsByQuery(query, req);
  }

  @ApiOperation({ summary: 'Get content' })
  @Get('/content')
  getContent() {
    return this.orgsService.getContent();
  }

  @ApiOperation({ summary: 'Get content' })
  @Get('/apps')
  getApps() {
    return this.orgsService.getApps();
  }

  @ApiOperation({ summary: 'Get organization by id' })
  @ApiResponse({ status: 200, type: Org })
  @Get(':orgId')
  async getByOrgId(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.getByOrgId(orgId);
  }

  @ApiOperation({ summary: 'Get organization events history' })
  @ApiResponse({ status: 200, type: [Org] })
  @Get(':orgId/history')
  async getOrgHistory(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.getOrgHistory(orgId);
  }

  @ApiOperation({ summary: 'Get organization events history' })
  @ApiResponse({ status: 200, type: [Org] })
  @Get(':orgId/revenue')
  async getOrgRevenue(
    @Param('orgId') orgId: string,
    @Req() req: Request,
    @Query(new ValidationPipe({ transform: true })) query: OrgRevenueFilterDto,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.getOrgRevenue(orgId, query);
  }

  @ApiOperation({ summary: 'Split now' })
  @ApiResponse({ status: 200 })
  @Post(':orgId/split')
  async splitNow(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.splitNow(orgId);
  }

  @ApiOperation({ summary: 'Add member to organization' })
  @ApiResponse({ status: 200, type: Member })
  @Post(':orgId/members')
  @HttpCode(HttpStatus.CREATED)
  async addMemberToOrg(
    @Param('orgId') orgId: string,
    @Body() member: MemberDto,
    @Req() req: Request,
  ): Promise<Member> {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);
    return this.orgsService.addMemberToOrg(orgId, member);
  }

  @ApiOperation({ summary: 'Get org members' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':orgId/members')
  async getOrgMembers(
    @Param('orgId') orgId: string,
    @Query() params: MembersFilterDto,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.getOrgMembers(orgId, params);
  }

  @ApiOperation({ summary: 'Get member equity info' })
  @ApiResponse({ status: 200, type: MemberEquityDto })
  @Get(':orgId/members/:memberId/equity')
  async getMemberEquity(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.getMemberEquity(memberId);
  }

  @ApiOperation({ summary: 'Get orgs logo' })
  @ApiResponse({ status: 200 })
  @Get('/logo/:fileName')
  async getOrgLogo(@Param('fileName') fileName: string, @Res() res: Response) {
    const data = await this.orgsService.getLogo(fileName);
    res.writeHead(200, { 'content-type': 'image/*' });
    res.write(data.file, 'binary');
    res.end(null, 'binary');
  }

  @ApiTags('Payment')
  @ApiOperation({ summary: 'Create a payment receiving URL' })
  @ApiResponse({ status: 201, description: 'New payment', type: Payment })
  @Post(':orgId/payments/receive')
  @HttpCode(HttpStatus.CREATED)
  async receivePayment(
    @Param('orgId') orgId: string,
    @Body(new ValidationPipe()) body: ReceivePaymentDto,
  ) {
    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    return this.paymentService.receivePayment(org, body);
  }

  @ApiTags('Payment')
  @ApiOperation({ summary: 'Create a payment and redirect to URL' })
  @ApiResponse({ status: 301 })
  @Get(':orgId/payments/receive')
  @HttpCode(HttpStatus.CREATED)
  async redirectToPayment(
    @Param('orgId') orgId: string,
    @Query(new ValidationPipe()) params: ReceivePaymentDto,
    @Res() res: Response,
  ) {
    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    const payment = await this.paymentService.receivePayment(org, params);
    const paymentUrl = `${process.env.APP_URL}/checkout/${payment._id}`;
    res.redirect(paymentUrl);
  }

  @ApiOperation({ summary: 'Get orgs Credit$ balance' })
  @ApiResponse({ status: 200, type: Number })
  @Get(':orgId/usdc/balance')
  async getOrgBalance(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);

    return {
      balance: await this.orgsService.getOrgBalance(orgId),
    };
  }

  @ApiOperation({ summary: 'Send Credit$ from org' })
  @ApiResponse({ status: 200 })
  @Post(':orgId/usdc/send')
  @HttpCode(HttpStatus.OK)
  async sendUsdc(
    @Body() sendUsdcDto: SendUsdcDto,
    @Param('orgId') orgId: string,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);
    return this.orgsService.sendUsdc(orgId, sendUsdcDto);
  }

  @ApiOperation({ summary: 'Get org memberships' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':orgId/memberships')
  async getMemberships(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.getMemberships(orgId);
  }

  @ApiOperation({ summary: 'Login as organisation' })
  @ApiResponse({ status: 200 })
  @Post(':orgId/login')
  async loginAsOrg(@Param('orgId') orgId: string, @Req() req: Request) {
    const account = await this.authService.getAccountFromToken(req);
    return this.orgsService.loginAsOrg(orgId, account);
  }

  @ApiOperation({ summary: 'Update organization' })
  @ApiResponse({ status: 200, type: Org })
  @Put(':orgId/update')
  @HttpCode(HttpStatus.OK)
  async updateOrg(
    @Param('orgId') orgId: string,
    @Body() updateOrgDto: UpdateOrgDto,
    @Req() req: Request,
  ) {
    const account = await this.authService.getAccountFromToken(req);
    await this.authService.permissionCheck(orgId, account);
    return this.orgsService.updateOrg(updateOrgDto, orgId);
  }

  @ApiOperation({ summary: 'Update logo' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          description: `The image to upload (image/jpeg, image/png, image/tiff). Max size: 20MB`,
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200 })
  @Post('/upload-logo')
  @UseInterceptors(FileInterceptor('logo'))
  @HttpCode(HttpStatus.OK)
  async uploadLogo(@UploadedFile() logo, @Req() req: Request): Promise<string> {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.uploadLogo(logo);
  }

  @ApiOperation({ summary: 'Delete avatar' })
  @ApiResponse({ status: 200 })
  @Post('/delete-avatars')
  @HttpCode(HttpStatus.OK)
  async deleteAvatar(
    @Body() deleteLogosDto: DeleteLogosRequestDto,
    @Req() req: Request,
  ) {
    await this.authService.getAccountFromToken(req);
    return this.orgsService.deleteLogo(deleteLogosDto.fileName);
  }
}
