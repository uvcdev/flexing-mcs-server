import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

// 기본 interface
export interface QnaAnswerAttributes {
  id: number;
  questionId: number;
  userId: number;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class QnaAnswer extends Model implements QnaAnswerAttributes {
  public readonly id!: QnaAnswerAttributes['id'];
  public questionId!: QnaAnswerAttributes['questionId'];
  public userId!: QnaAnswerAttributes['userId'];
  public content!: QnaAnswerAttributes['content'];
  public readonly createdAt!: QnaAnswerAttributes['createdAt'];
  public readonly updatedAt!: QnaAnswerAttributes['updatedAt'];
  public readonly deletedAt!: QnaAnswerAttributes['deletedAt'];
}

QnaAnswer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    questionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
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
export interface QnaAnswerInsertParams {
  questionId: number;
  userId: number;
  content?: string | null;
  fileIds?: number[] | null;
}

// update
export interface QnaAnswerUpdateParams {
  id?: number;
  content?: string | null;
  fileIds?: number[] | null;
}

// delete
export interface QnaAnswerDeleteParams {
  id?: number;
}

// include attributes
export const QnaAnswerAttributesInclude = ['id', 'questionId', 'userId', 'content', 'createdAt', 'updatedAt'];

export default QnaAnswer;
