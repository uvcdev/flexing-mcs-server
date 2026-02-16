import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { logSequelize } from '../sequelize';

export interface PlcDataChangeHistoryLogAttributes {
  id: number; // 아이디
  ts: Date; // 타임스탬프
  facilityCode: string; // 설비코드
  facilityName: string; // 설비명
  facilityType: string; // 설비타입
  isTriggered: boolean; // 트리거 여부
  tagName: string; // 태그명
  oldValue: string | null; // 이전 값
  newValue: string | null; // 새로운 값
  valueType: string | null; // 값 타입
  snapshotData: Record<string, number | string | boolean | null> | null; // 스냅샷데이터
  createdAt: Date; // 생성 시간
}

class PlcDataChangeHistoryLog extends Model implements PlcDataChangeHistoryLogAttributes {
  public readonly id!: PlcDataChangeHistoryLogAttributes['id'];
  public readonly ts!: PlcDataChangeHistoryLogAttributes['ts'];
  public facilityCode!: PlcDataChangeHistoryLogAttributes['facilityCode'];
  public facilityName!: PlcDataChangeHistoryLogAttributes['facilityName'];
  public facilityType!: PlcDataChangeHistoryLogAttributes['facilityType'];
  public isTriggered!: PlcDataChangeHistoryLogAttributes['isTriggered'];
  public tagName!: PlcDataChangeHistoryLogAttributes['tagName'];
  public oldValue!: PlcDataChangeHistoryLogAttributes['oldValue'];
  public newValue!: PlcDataChangeHistoryLogAttributes['newValue'];
  public valueType!: PlcDataChangeHistoryLogAttributes['valueType'];
  public snapshotData!: PlcDataChangeHistoryLogAttributes['snapshotData'];
  public readonly createdAt!: PlcDataChangeHistoryLogAttributes['createdAt'];
}

PlcDataChangeHistoryLog.init(
  {
    id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      autoIncrement: true,
    },
    ts: {
      type: DataTypes.DATE,
      allowNull: false,
      primaryKey: true,
    },
    facilityName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      primaryKey: true,
    },
    tagName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      primaryKey: true,
    },
    facilityCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    facilityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    isTriggered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    oldValue: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    valueType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    snapshotData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
  },
  {
    sequelize: logSequelize,
    underscored: true,
    timestamps: false,
    paranoid: false,
  }
);

export interface PlcDataChangeHistoryLogInsertParams {
  ts: Date;
  facilityName: string;
  tagName: string;
  facilityCode: string;
  facilityType: string;
  isTriggered: boolean;
  oldValue: string | null;
  newValue: string | null;
  valueType: string | null;
  snapshotData: Record<string, number | string | boolean | null> | null;
  createdAt: Date;
}
// facilityName, tagName들은 다중 선택하여 조회가 가능
export interface PlcDataChangeHistoryLogSelectListParams {
  facilityCode?: string;
  facilityName?: string[];
  facilityType?: string;
  isTriggered?: boolean;
  tagName?: string[];
  oldValue?: string | null;
  newValue?: string | null;
  valueType?: string | null;
  snapshotData?: Record<string, number | string | boolean | null> | null;
  tsFrom?: Date | null;
  tsTo?: Date | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  order?: string;
}

export interface PlcDataChangeHistoryLogSelectListQuery {
  where?: WhereOptions<PlcDataChangeHistoryLogAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

export interface PlcDataChangeHistoryLogSelectInfoParams {
  id?: number;
}

export default PlcDataChangeHistoryLog;
