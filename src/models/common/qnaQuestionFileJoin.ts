import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import QnaQuestion from './qnaQuestion';
import File from './file';

// 기본 interface
export interface QnaQuestionFileJoinAttributes {
  id: number;
  questionId: number;
  fileId: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class QnaQuestionFileJoin extends Model implements QnaQuestionFileJoinAttributes {
  public readonly id!: QnaQuestionFileJoinAttributes['id'];
  public questionId!: QnaQuestionFileJoinAttributes['questionId'];
  public fileId!: QnaQuestionFileJoinAttributes['fileId'];
  public readonly createdAt!: QnaQuestionFileJoinAttributes['createdAt'];
  public readonly updatedAt!: QnaQuestionFileJoinAttributes['updatedAt'];
  public readonly deletedAt!: QnaQuestionFileJoinAttributes['deletedAt'];
}

QnaQuestionFileJoin.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    questionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: QnaQuestion,
        key: 'id',
      },
    },
    fileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: File,
        key: 'id',
      },
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
export interface QnaQuestionFileJoinInsertParams {
  questionId: number;
  fileId: number;
}

// delete
export interface QnaQuestionFileJoinDeleteParams {
  questionId?: number;
  fileId?: number;
}

export default QnaQuestionFileJoin;
