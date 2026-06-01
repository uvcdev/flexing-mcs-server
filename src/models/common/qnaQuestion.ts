import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';

// 기본 interface
export interface QnaQuestionAttributes {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: string | null;
  isNotice: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class QnaQuestion extends Model implements QnaQuestionAttributes {
  public readonly id!: QnaQuestionAttributes['id'];
  public userId!: QnaQuestionAttributes['userId'];
  public title!: QnaQuestionAttributes['title'];
  public content!: QnaQuestionAttributes['content'];
  public type!: QnaQuestionAttributes['type'];
  public isNotice!: QnaQuestionAttributes['isNotice'];
  public readonly createdAt!: QnaQuestionAttributes['createdAt'];
  public readonly updatedAt!: QnaQuestionAttributes['updatedAt'];
  public readonly deletedAt!: QnaQuestionAttributes['deletedAt'];
}

QnaQuestion.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    isNotice: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
export interface QnaQuestionInsertParams {
  userId: number;
  title: string;
  content: string;
  type?: string | null;
  isNotice?: boolean;
  fileIds?: number[] | null;
}

// selectList
export interface QnaQuestionSelectListParams {
  title?: string | null;
  types?: string[] | null;
  userId?: number | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  order?: string;
}
export interface QnaQuestionSelectListQuery {
  where?: WhereOptions<QnaQuestionAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

// selectInfo
export interface QnaQuestionSelectInfoParams {
  id?: number;
}

// update
export interface QnaQuestionUpdateParams {
  id?: number;
  title?: string;
  content?: string;
  type?: string | null;
  isNotice?: boolean;
  fileIds?: number[] | null;
}

// delete
export interface QnaQuestionDeleteParams {
  id?: number;
}

// include attributes
export const QnaQuestionAttributesInclude = [
  'id',
  'userId',
  'title',
  'content',
  'type',
  'isNotice',
  'createdAt',
  'updatedAt',
];

export default QnaQuestion;
