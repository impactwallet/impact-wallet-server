import { get, isNil } from 'lodash';
import { OrgDocument } from '../../orgs/schema/org.schema';
import { UserDocument } from '../../users/schema/user.schema';
import { Model } from 'mongoose';

export class AccountModel {
  constructor(public user: UserDocument, public org?: OrgDocument) {}

  get isUser() {
    return isNil(this.org);
  }

  get wallet() {
    return get(this, 'org.wallet', this.user.wallet);
  }

  get id() {
    return get(this, 'org._id', this.user._id);
  }

  get name() {
    return get(this, 'org.name', this.user.name);
  }

  get username() {
    return get(this, 'org.username', this.user.nickname);
  }

  get image() {
    return get(this, 'org.logo', this.user.avatar);
  }

  get model() {
    return this.isUser ? Model<UserDocument> : Model<OrgDocument>;
  }

  get password() {
    return this.model.findById(this.id, '+password');
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      username: this.username,
      wallet: this.wallet,
      isUser: this.isUser,
      image: this.image,
      user: this.user,
    };
  }
}