import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import QnaAnswer from './qnaAnswer';
import File from './file';

// 기본 interface
export interface QnaAnswerFileJoinAttributes {
  id: number;
  answerId: number;
  fileId: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class QnaAnswerFileJoin extends Model implements QnaAnswerFileJoinAttributes {
  public readonly id!: QnaAnswerFileJoinAttributes['id'];
  public answerId!: QnaAnswerFileJoinAttributes['answerId'];
  public fileId!: QnaAnswerFileJoinAttributes['fileId'];
  public readonly createdAt!: QnaAnswerFileJoinAttributes['createdAt'];
  public readonly updatedAt!: QnaAnswerFileJoinAttributes['updatedAt'];
  public readonly deletedAt!: QnaAnswerFileJoinAttributes['deletedAt'];
}

QnaAnswerFileJoin.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    answerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: QnaAnswer,
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
export interface QnaAnswerFileJoinInsertParams {
  answerId: number;
  fileId: number;
}

// delete
export interface QnaAnswerFileJoinDeleteParams {
  answerId?: number;
  fileId?: number;
}

export default QnaAnswerFileJoin;
