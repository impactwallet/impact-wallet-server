import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
    Req,
    ValidationPipe
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OfferStatusBodyDto } from './dto/offer-status.dto';
import { OffersLiteService } from './offers.service.lite';
import { AuthService } from '../auth/auth.service';
import { Offer } from './schema/offer.schema';
import { OfferLiteDto } from './dto/offer.lite.dto';
import { OrgsService } from '../orgs/orgs.service';
import { isNil } from 'lodash';

@ApiTags('Offers - Lite')
@Controller()
export class OffersControllerLite {
    constructor(
        private readonly offerServiceLite: OffersLiteService,
        private readonly orgService: OrgsService,
        private readonly authService: AuthService
    ) {}

    @ApiOperation({ summary: 'Accept/decline sale offer' })
    @ApiResponse({ status: 200, description: 'Offer status updated' })
    @ApiResponse({
        status: 403,
        description: 'Offer already accepted/declined'
    })
    @Patch('lite/offers/sale/:offerId')
    async updateSaleOfferStatus(
        @Param('offerId') offerId: string,
        @Body(new ValidationPipe()) body: OfferStatusBodyDto,
        @Req() req: Request
    ) {
        const account = await this.authService.getAccountFromToken(req);

        return this.offerServiceLite.updateSaleOfferStatus(
            offerId,
            body,
            account
        );
    }

    @ApiOperation({ summary: 'Create new offer in lite mode' })
    @ApiResponse({ status: 200, type: Offer })
    @ApiTags('Orgs - Lite')
    @Post('lite/orgs/:orgId/offers')
    @HttpCode(HttpStatus.CREATED)
    async createOffer(
        @Param('orgId') orgId: string,
        @Body() offer: OfferLiteDto,
        @Req() req: Request
    ) {
        const account = await this.authService.getAccountFromToken(req);
        await this.authService.permissionCheck(orgId, account);

        const org = await this.orgService.getByOrgId(orgId);
        if (isNil(org)) {
            throw new NotFoundException({ message: 'Organization not found' });
        }

        return this.offerServiceLite.createLiteOffer(orgId, offer);
    }

    @ApiOperation({ summary: 'Accept/decline offer' })
    @ApiResponse({
        status: 200,
        description: 'Offer status updated and new member added to the org'
    })
    @ApiTags('Orgs - Lite')
    @Patch('lite/orgs/:orgId/offers/:offerId')
    async updateOfferStatus(
        @Param('orgId') orgId: string,
        @Param('offerId') offerId: string,
        @Body(new ValidationPipe()) body: OfferStatusBodyDto,
        @Req() req: Request
    ) {
        const account = await this.authService.getAccountFromToken(req);

        return this.offerServiceLite.updateOfferStatus(
            orgId,
            offerId,
            body,
            account
        );
    }
}
