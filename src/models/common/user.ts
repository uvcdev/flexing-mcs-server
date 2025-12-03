import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';

// 기본 interface
export interface UserAttributes {
  id: number;
  userid: string;
  password: string;
  name: string;
  email: string | null;
  mobile: string | null;
  active: boolean;
  loginFailCount: number;
  lastLogin: Date | null;
  lastLogout: Date | null;
  otherDate: Date;
  auth: 'viewer' | 'staff' | 'admin' | 'system';
  language: 'ko' | 'en' | 'es';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class User extends Model implements UserAttributes {
  public readonly id!: UserAttributes['id'];
  public userid!: UserAttributes['userid'];
  public password!: UserAttributes['password'];
  public name!: UserAttributes['name'];
  public email!: UserAttributes['email'];
  public mobile!: UserAttributes['mobile'];
  public active!: UserAttributes['active'];
  public loginFailCount!: UserAttributes['loginFailCount'];
  public lastLogin!: UserAttributes['lastLogin'];
  public lastLogout!: UserAttributes['lastLogout'];
  public otherDate!: UserAttributes['otherDate'];
  public auth!: UserAttributes['auth'];
  public language!: UserAttributes['language'];
  public readonly createdAt!: UserAttributes['createdAt'];
  public readonly updatedAt!: UserAttributes['updatedAt'];
  public readonly deletedAt!: UserAttributes['deletedAt'];
}

export const UserDefaults = {
  auth: 'staff',
  active: false,
  loginFailCount: 0,
  language: 'es',
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
    auth: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: UserDefaults.auth,
    },
    language: {
      type: DataTypes.STRING(10),
      defaultValue: UserDefaults.language,
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
  name: string;
  email: string | null;
  mobile: string | null;
  active: boolean;
  auth: 'viewer' | 'staff' | 'admin' | 'system';
  language: UserAttributes['language'];
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
  name?: string;
  email?: string | null;
  mobile?: string | null;
  active?: boolean;
  auth?: 'viewer' | 'staff' | 'admin' | 'system';
  language?: UserAttributes['language'];
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
export const UserAttributesInclude = ['id', 'userid', 'name', 'createdAt', 'active', 'auth', 'language'];

export default User;
