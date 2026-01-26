import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';

export interface MenuRoleAttributes {
  id: number;
  auth: string;
  menuPath: string;
  name: string | null;
  authMenu: boolean;
  authCreate: boolean;
  authUpdate: boolean;
  authDelete: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

class MenuRole extends Model implements MenuRoleAttributes {
  public readonly id!: MenuRoleAttributes['id'];
  public auth!: MenuRoleAttributes['auth'];
  public menuPath!: MenuRoleAttributes['menuPath'];
  public name!: MenuRoleAttributes['name'];
  public authMenu!: MenuRoleAttributes['authMenu'];
  public authCreate!: MenuRoleAttributes['authCreate'];
  public authUpdate!: MenuRoleAttributes['authUpdate'];
  public authDelete!: MenuRoleAttributes['authDelete'];
  public readonly createdAt!: MenuRoleAttributes['createdAt'];
  public readonly updatedAt!: MenuRoleAttributes['updatedAt'];
  public readonly deletedAt!: MenuRoleAttributes['deletedAt'];
}

MenuRole.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    auth: {
      type: DataTypes.STRING(50),
      unique: 'unique_role_menu',
      allowNull: false,
    },
    menuPath: {
      type: DataTypes.STRING(255),
      unique: 'unique_role_menu',
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
    },
    authMenu: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    authCreate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    authUpdate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    authDelete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
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

export interface MenuRoleInsertParams {
  auth: string;
  menuPath: string;
  name: string | null;
  authMenu: boolean;
  authCreate: boolean;
  authUpdate: boolean;
  authDelete: boolean;
}

export interface MenuRoleBulkInsertParams {
  menuRoleList: Array<MenuRoleInsertParams>;
}

export interface MenuRoleSelectListParams {
  auth?: string | null;
  limit?: number;
  offset?: number;
  order?: string;
}

export interface MenuRoleSelectListQuery {
  where?: WhereOptions<MenuRoleAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

export default MenuRole;
