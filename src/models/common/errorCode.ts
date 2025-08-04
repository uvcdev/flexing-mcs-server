import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';

export interface ErrorCodeAttributes {
  id: number;
  code: string;        // 에러 코드
  errorFrom: ErrorFromType;    // 에러 발생 위치
  messageKo: string;   // 국문 내용
  messageEn: string;   // 영문 내용
  messageEs: string;   // 스페인어 내용
  errorLevel: ErrorLevel;  // 에러 레벨
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class ErrorCode extends Model implements ErrorCodeAttributes {
  public readonly id!: ErrorCodeAttributes['id'];
  public code!: ErrorCodeAttributes['code'];
  public errorFrom!: ErrorCodeAttributes['errorFrom'];
  public messageKo!: ErrorCodeAttributes['messageKo'];
  public messageEn!: ErrorCodeAttributes['messageEn'];
  public messageEs!: ErrorCodeAttributes['messageEs'];
  public errorLevel!: ErrorCodeAttributes['errorLevel'];
  public readonly createdAt!: ErrorCodeAttributes['createdAt'];
  public readonly updatedAt!: ErrorCodeAttributes['updatedAt'];
  public readonly deletedAt!: ErrorCodeAttributes['deletedAt'];
}

export type ErrorFromType =
  'WMS' |           // 창고 관련 에러
  'FAC' |      // 설비 관련 에러
  'MCS' |           // MCS 서버 관련 에러
  'ACS' |           // ACS 서버 관련 에러
  'ETC';            // 이외의 에러

export type ErrorLevel = 'info' | 'warning' | 'error';

export const ErrorCodeDefaultValue = {
  errorFrom: 'ETC',
  errorLevel: 'error'
};

ErrorCode.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    errorFrom: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: ErrorCodeDefaultValue.errorFrom
    },
    messageKo: {
      type: DataTypes.TEXT,
    },
    messageEn: {
      type: DataTypes.TEXT,
    },
    messageEs: {
      type: DataTypes.TEXT,
    },
    errorLevel: {
      type: DataTypes.STRING(20),
      defaultValue: ErrorCodeDefaultValue.errorLevel
    },
  },
  {
    sequelize,
    // tableName: 'tableName', // table명을 수동으로 생성 함
    // freezeTableName: true, // true: table명의 복수형 변환을 막음
    underscored: true, // true: underscored, false: camelCase
    timestamps: true, // createAt, updatedAt
    paranoid: true, // deletedAt
    indexes: [      // location 과 code 를 묶어서 유니크 처리
      {
        unique: true,
        fields: ['error_from', 'code'],
        name: 'unique_error_from_code'
      }
    ]
  }
);

/* 인터페이스 정의 시작 */
// insert
export interface ErrorCodeInsertParams {
  code: string;
  errorFrom: ErrorCodeAttributes['errorFrom'];
  messageKo: string | null;
  messageEn: string | null;
  messageEs: string | null;
  errorLevel: ErrorCodeAttributes['errorLevel'];
}

export interface ErrorCodeSelectListParams {
  ids?: Array<number> | null;
  code?: string;
  errorFrom?: ErrorCodeAttributes['errorFrom'];
  errorLevel?: ErrorCodeAttributes['errorLevel'];
  limit?: number;
  offset?: number;
  attributes?: Array<string>;
}

export interface ErrorCodeSelectListQuery {
  where?: WhereOptions<ErrorCodeAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
  attributes?: Array<string>;
}

// selectInfo
export interface ErrorCodeSelectInfoParams {
  id?: number;
}

// selectInfo by code
export interface ErrorCodeSelectInfoByCodeParams {
  code?: string;
}

// selectInfo by location and code
export interface ErrorCodeSelectInfoByErrorFromAndCodeParams {
  errorFrom: ErrorCodeAttributes['errorFrom'];
  code: string;
}

// update
export interface ErrorCodeUpdateParams {
  id?: ErrorCodeAttributes['id'];
  code?: string;
  errorFrom?: ErrorCodeAttributes['errorFrom'];
  messageKo?: string;
  messageEn?: string;
  messageEs?: string;
  errorLevel?: ErrorCodeAttributes['errorLevel'];
}

// delete
export interface ErrorCodeDeleteParams {
  id?: ErrorCodeAttributes['id'];
}

/* 인터페이스 정의 끝 */

export default ErrorCode;
