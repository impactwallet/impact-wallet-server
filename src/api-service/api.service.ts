import { Injectable } from '@nestjs/common';
import { HttpService } from "@nestjs/axios";
import { map, catchError, firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class ApiService {
  baseUrl = 'https://api.shyft.to/sol/v1';

  constructor(private http: HttpService) { }

  async createWallet(password: string) {
    const headers = new Map();
    headers.set("Content-Type", "application/json");
    headers.set("x-api-key", "xdKM4xYv9r-uONmT");

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers.entries()),
    };

    const request = JSON.stringify({
      "password": password,
    });

    return await firstValueFrom(this.http
      .post(
        `${this.baseUrl}/semi_wallet/create`,
        request,
        config
      )
      .pipe(
        map((res) => res.data?.result),
        map((result) => {
          return result?.wallet_address;
        }),
      )
      .pipe(catchError((err) => {
        err.message = `Error creating wallet: ${err.message}`;
        throw err;
      })),);
  }


  async createFungibleTokensForOrganization(orgName: string, wallet: string) {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append("x-api-key", "xdKM4xYv9r-uONmT");

    const formData = new FormData();
    formData.append("network", "devnet");
    formData.append("wallet", wallet);
    formData.append("name", orgName);
    formData.append("symbol", orgName);

    const config: AxiosRequestConfig = {
      headers: Object.fromEntries(headers.entries()),
      timeout: 100000,
    };

    const requestOptions = {
      method: 'POST',
      body: formData,
      redirect: 'follow',
    };


    return this.http.axiosRef
      .post(
        'https://api.shyft.to/sol/v1/token/create_detach',
        requestOptions,
        config
      );
    // .pipe(
    //     map((res) => res.data?.result),
    //     map((result) => {
    //         console.log(result);
    //         return result;
    //     }),
    // )
    // // .pipe(
    // //     catchError(() => {
    // //         throw new ForbiddenException('API create fungible tokens not available');
    // //     }),
    // );
  }

}
