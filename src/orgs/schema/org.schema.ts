import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { HydratedDocument } from 'mongoose';
import { Member } from 'src/members/schema/member.schema';

export type OrgDocument = HydratedDocument<Org>;

@Schema()
export class Org {

  @ApiProperty({ example: 'Impact-Wallet', description: 'Name of organizations' })
  @Prop({unique: true})
    name: string;

  @ApiProperty({ example: 'Turn your time into equity', description: 'Information about the organization' })
  @Prop()
    description: string;

  @ApiProperty({ example: 'https://impact-wallet.com', description: 'Organization link' })
  @Prop()
    link: string;

  @ApiProperty({ example: '30', description: 'Reserved for organization needs' })
  @Prop()
    treasure: number;

  @ApiProperty({ example: 'jpg, png', description: 'Logo organization' })
  @Prop()
    logo: string;

  @ApiProperty({ example: '6ZMDvWkKG9v7GhoTjCPd9FyVCQ36YVxxsB7W57At9ShD', description: 'Organization wallet' })
  @Prop()
    wallet: string;

  @ApiProperty({ example: 'msLadpoohjKhd621CPd9FyVCQ36YVsxxsB7W57At9ShM', description: 'Organization token' })
  @Prop()
    token: string;

  @ApiProperty({ example: 'EAmTA4TiEPShWKgy3G1iYyco3suogTocZVVbAwqjoPKV', description: 'Organization mint' })
  @Prop()
    mint: string;

  @ApiProperty({ example: '["0b1bd52d-7d8e-4518-b0a3-13ae5ad52d47","0sdfsdf-7234g-4sdf8-b13vc-dfcvb52d47"]', description: 'members of organization' })
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }] })
    members: Member[];
    
  @Prop()
    password: string;

}

export const OrgSchema = SchemaFactory.createForClass(Org);