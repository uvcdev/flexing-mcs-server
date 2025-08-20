import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';

// 기본 interface
export interface UserAttributes {
  id: number;
  userid: string;
  password: string;
  auth: 'viewer' | 'staff' | 'admin' | 'system';
  name: string;
  email: string | null;
  mobile: string | null;
  active: boolean;
  loginFailCount: number;
  lastLogin: Date | null;
  lastLogout: Date | null;
  otherDate: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class User extends Model implements UserAttributes {
  public readonly id!: UserAttributes['id'];
  public userid!: UserAttributes['userid'];
  public password!: UserAttributes['password'];
  public auth!: UserAttributes['auth'];
  public name!: UserAttributes['name'];
  public email!: UserAttributes['email'];
  public mobile!: UserAttributes['mobile'];
  public active!: UserAttributes['active'];
  public loginFailCount!: UserAttributes['loginFailCount'];
  public lastLogin!: UserAttributes['lastLogin'];
  public lastLogout!: UserAttributes['lastLogout'];
  public otherDate!: UserAttributes['otherDate'];
  public readonly createdAt!: UserAttributes['createdAt'];
  public readonly updatedAt!: UserAttributes['updatedAt'];
  public readonly deletedAt!: UserAttributes['deletedAt'];
}

export const UserDefaults = {
  auth: 'staff',
  active: false,
  loginFailCount: 0,
};

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userid: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    auth: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'staff',
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
    },
    mobile: {
      type: DataTypes.STRING(20),
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    loginFailCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: UserDefaults.loginFailCount,
    },
    lastLogin: {
      type: DataTypes.DATE,
    },
    lastLogout: {
      type: DataTypes.DATE,
    },
    updatedPassword: {
      type: DataTypes.DATE,
    },
    otherDate: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    // tableName: 'tableName', // table명을 수동으로 생성 함
    // freezeTableName: true, // true: table명의 복수형 변환을 막음
    underscored: true, // true: underscored, false: camelCase
    timestamps: true, // createAt, updatedAt
    paranoid: true, // deletedAt
  }
);

// insert
export interface UserInsertParams {
  userid: string;
  password: string;
  auth: UserAttributes['auth'];
  name: string;
  email: string | null;
  mobile: string | null;
  active: boolean;
}

// selectList
export interface UserSelectListParams {
  ids?: Array<number> | null;
  userid?: string | null;
  name?: string | null;
  active?: boolean | null;
  limit?: number;
  offset?: number;
  order?: string;
}
export interface UserSelectListQuery {
  where?: WhereOptions<UserAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

// selectInfo
export interface UserSelectInfoParams {
  id?: number;
}

// selectOne
export interface UserSelectOneParams {
  id?: number;
}

// update
export interface UserUpdateParams {
  id?: number;
  auth?: UserAttributes['auth'];
  name?: string;
  email?: string | null;
  mobile?: string | null;
  active?: boolean;
}

// updatePassword
export interface UserUpdatePasswordParams {
  id?: number;
  password?: string;
  oldPassword?: string;
  newPassword?: string;
}

// delete
export interface UserDeleteParams {
  id?: number;
}

// 로그인을 위한 파라미터
export interface UserLoginParams {
  userid: string;
  password: string;
}

// 로그인 실패 카운트 업데이트
export interface UserLoginFailCountUpdateParams {
  id: number;
  loginFailCount: number;
}

// 로그아웃을 위한 파라미터
export interface UserLogoutParams {
  id: number;
}

// include attributes
export const UserAttributesInclude = ['id', 'userid', 'name', 'auth', 'createdAt', 'active'];

export default User;
