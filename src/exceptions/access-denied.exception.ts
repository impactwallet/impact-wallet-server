import { HttpException, HttpStatus } from '@nestjs/common';

export class AccessDeniedException extends HttpException {
    message: any;
    constructor(response: string | Record<string, any>) {
        super(response, HttpStatus.FORBIDDEN);
        this.message = response;
    }
}
