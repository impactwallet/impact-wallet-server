import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UploadedFile, UseInterceptors, Headers, NotFoundException, ValidationPipe, Res } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Org } from './schema/org.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrgsService } from './orgs.service';
import { CreateOrgDto } from './dto/create-org.dto';
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

@ApiTags('Orgs')
@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly orgsService: OrgsService,
    private readonly authService: AuthService,
    private readonly paymentService: PaymentService,
  ) {
  }

  @ApiOperation({ summary: 'Check if an organization exists' })
  @ApiResponse({ status: 200, description: 'Organization exists' })
  @ApiResponse({ status: 404, description: 'Organization does not exist' })
  @Get('username')
  async findOrgByUsername(@Query() query: OrgUsernameFilter, @Req() req: Request) {
    await this.authService.getUserFromToken(req);
    return this.orgsService.findOrgByUsername(query);
  }


  @ApiOperation({ summary: 'Create organization' })
  @ApiResponse({ status: 201, type: Org })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('form-data')
  @UseInterceptors(FileInterceptor('logo'))
  @ApiMockHeader('If true wallet and token creations are skipped')
  createOrg(
    @Body() createOrgDto: CreateOrgDto,
      @UploadedFile() logo: any,
      @Headers('mock') mock: string,
      @Req() req: Request,
  ): Promise<Org> {
    return this.orgsService.createOrg(createOrgDto, logo, mock === 'true', req);
  }

  @ApiOperation({ summary: 'Get organizations' })
  @ApiResponse({ status: 200, type: [Org] })
  @Get()
  getOrgsByQuery(@Query() query: OrgsFilter, @Req() req: Request) {
    return this.orgsService.getOrgsByQuery(query, req);
  }

  @ApiOperation({ summary: 'Get organization by id' })
  @ApiResponse({ status: 200, type: Org })
  @Get(':orgId')
  async getByOrgId(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getUserFromToken(req);
    return this.orgsService.getByOrgId(orgId);
  }

  @ApiOperation({ summary: 'Get organization events history' })
  @ApiResponse({ status: 200, type: [Org] })
  @Get(':orgId/history')
  async getOrgHistory(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.authService.getUserFromToken(req);
    return this.orgsService.getOrgHistory(orgId);
  }

  @ApiOperation({ summary: 'Add member to organization' })
  @ApiResponse({ status: 200, type: Member })
  @Post(':orgId/members')
  @HttpCode(HttpStatus.CREATED)
  async addMemberToOrg(
    @Param('orgId') orgId: string,
      @Body() member: MemberDto,
      @Req() req: Request
  ): Promise<Member> {
    await this.authService.getUserFromToken(req);
    return this.orgsService.addMemberToOrg(orgId, member);
  }

  @ApiOperation({ summary: 'Get org members' })
  @ApiResponse({ status: 200, type: [Member] })
  @Get(':orgId/members')
  getOrgMembers(@Param('orgId') orgId: string, @Req() req: Request) {
    return this.orgsService.getOrgMembers(orgId, req);
  }

  @ApiOperation({ summary: 'Get member equity info' })
  @ApiResponse({ status: 200, type: MemberEquityDto })
  @Get(':orgId/members/:memberId/equity')
  async getMemberEquity(
  @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    await this.authService.getUserFromToken(req);
    return this.orgsService.getMemberEquity(orgId, memberId);
  }

  @ApiOperation({ summary: 'Get orgs logo' })
  @ApiResponse({ status: 200 })
  @Get('/logo/:fileName')
  async getOrgLogo(
  @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
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
    // TODO: implement api key logic
    const org = await this.orgsService.getByOrgId(orgId);
    if (isNil(org)) {
      throw new NotFoundException({ message: 'Organization not found' });
    }

    return this.paymentService.receivePayment(org, body);
  }

  @ApiOperation({ summary: 'Get orgs USDC balance' })
  @ApiResponse({ status: 200, type: Number })
  @Get(':orgId/usdc/balance')
  async getOrgBalance(
  @Param('orgId') orgId: string,
    @Req() req: Request,
  ) {
    await this.authService.getUserFromToken(req);

    return {
      balance: await this.orgsService.getOrgBalance(orgId),
    };
  }

  @ApiOperation({ summary: 'Send USDC from org' })
  @ApiResponse({ status: 200 })
  @Post(':orgId/usdc/send')
  @HttpCode(HttpStatus.OK)
  async sendUsdc(
  @Body() sendUsdcDto: SendUsdcDto,
    @Param('orgId') orgId: string,
    @Req() req: Request
  ) {
    await this.authService.getUserFromToken(req);

    return this.orgsService.sendUsdc(orgId, sendUsdcDto);
  }
}
