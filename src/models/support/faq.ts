import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';

// 기본 interface

export interface FaqMultiLanguageText {
  ko?: string;
  en?: string;
  es?: string;
  [key: string]: string | undefined;
}

export interface FaqAttributes {
  id: number;
  category: string | null;
  subCategory: string | null;
  question: FaqMultiLanguageText;
  answer: FaqMultiLanguageText;
  userId: number | null;
  orderby: number;
  syncId: string | null;
  visibleAuth: 'viewer' | 'staff' | 'admin' | 'system';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class Faq extends Model implements FaqAttributes {
  public readonly id!: FaqAttributes['id'];
  public category!: FaqAttributes['category'];
  public subCategory!: FaqAttributes['subCategory'];
  public question!: FaqAttributes['question'];
  public answer!: FaqAttributes['answer'];
  public userId!: FaqAttributes['userId'];
  public orderby!: FaqAttributes['orderby'];
  public syncId!: FaqAttributes['syncId'];
  public visibleAuth!: FaqAttributes['visibleAuth'];
  public readonly createdAt!: FaqAttributes['createdAt'];
  public readonly updatedAt!: FaqAttributes['updatedAt'];
  public readonly deletedAt!: FaqAttributes['deletedAt'];
}

export const FaqDefaults = {
  orderby: 0,
  visibleAuth: 'viewer',
};

Faq.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(50),
    },
    subCategory: {
      type: DataTypes.STRING(50),
    },
    question: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    answer: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
    },
    orderby: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: FaqDefaults.orderby,
    },
    syncId: {
      type: DataTypes.UUID,
      unique: true,
    },
    visibleAuth: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: FaqDefaults.visibleAuth,
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
export interface FaqInsertParams {
  category: string | null;
  subCategory: string | null;
  question: FaqMultiLanguageText;
  answer: FaqMultiLanguageText;
  userId: number | null;
  orderby: number;
  syncId: string | null;
  visibleAuth: FaqAttributes['visibleAuth'];
}

// selectList
export interface FaqSelectListParams {
  categories?: string[] | null;
  subCategories?: string[] | null;
  userIds?: number[] | null;
  visibleAuth?: FaqAttributes['visibleAuth'];
  limit?: number;
  offset?: number;
}
export interface FaqSelectListQuery {
  where?: WhereOptions<FaqAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

// selectInfo
export interface FaqSelectInfoParams {
  id?: number;
}

// selectOne
export interface FaqSelectOneParams {
  syncId?: string;
}

// update
export interface FaqUpdateParams {
  id?: number;
  category?: string | null;
  subCategory?: string | null;
  question?: FaqMultiLanguageText;
  answer?: FaqMultiLanguageText;
  userId?: number | null;
  orderby?: number;
  syncId?: string | null;
  visibleAuth?: FaqAttributes['visibleAuth'];
}

// delete
export interface FaqDeleteParams {
  id?: number;
}

// include attributes
export const FaqAttributesInclude = [
  'id',
  'category',
  'subCategory',
  'question',
  'answer',
  'userId',
  'orderby',
  'syncId',
  'visibleAuth',
  'createdAt',
];

export default Faq;
