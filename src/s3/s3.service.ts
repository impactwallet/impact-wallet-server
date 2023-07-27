import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand
} from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
    private s3: S3Client;
    private readonly awsPublicBucketName: string;

    constructor(private readonly configService: ConfigService) {
        this.s3 = new S3Client({
            region: configService.get<string>('AWS_REGION') as string,
            credentials: {
                accessKeyId: configService.get<string>(
                    'AWS_ACCESS_KEY_ID'
                ) as string,
                secretAccessKey: configService.get<string>(
                    'AWS_SECRET_ACCESS_KEY'
                ) as string
            }
        });
        this.awsPublicBucketName = configService.get<string>(
            'AWS_PUBLIC_BUCKET_NAME'
        ) as string;
    }

    async putFile(fileName: string, file: Buffer) {
        const params = {
            Bucket: this.awsPublicBucketName,
            Key: fileName,
            Body: file
        };
        const command = new PutObjectCommand(params);
        await this.s3.send(command);
        const url = `https://${this.awsPublicBucketName}.s3.amazonaws.com/${fileName}`;
        return { url, key: fileName };
    }

    async getFile(fileName: string) {
        const params = { Bucket: this.awsPublicBucketName, Key: fileName };
        const command = new GetObjectCommand(params);
        const response = await this.s3.send(command);
        return {
            contentType: response.ContentType,
            file: await response.Body.transformToByteArray()
        };
    }

    async deleteFile(fileName: string) {
        const params = { Bucket: this.awsPublicBucketName, Key: fileName };
        const command = new DeleteObjectCommand(params);
        await this.s3.send(command);
        return { deleted: true };
    }
}
