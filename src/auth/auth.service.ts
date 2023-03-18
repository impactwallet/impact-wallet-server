import { Injectable } from "@nestjs/common";
import { Request } from "express";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async getUserFromToken(req: Request) {
    return this.usersService.getUserFromToken(req);
  }
}