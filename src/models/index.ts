// Models(순서 중요 - references설정 때문)
// common
import CommonCode from './common/commonCode';
import User from './common/user';
import TokenHistory from './common/tokenHistory';
import File from './common/file';
import EventHistory from './common/eventHistory';
import Setting from './common/setting';
import AlarmEmail from './common/alarmEmail';
import McsAlarm from './common/mcsAlarm';
import Amr from './common/amr';
import ErrorCode from './common/errorCode';
import MenuRole from './common/menuRole';
import QnaQuestion from './common/qnaQuestion';
import QnaAnswer from './common/qnaAnswer';
import QnaQuestionFileJoin from './common/qnaQuestionFileJoin';
import QnaAnswerFileJoin from './common/qnaAnswerFileJoin';

// dashboard
import DailyStatistic from './dashboard/dailyStatistic';
import MonthlyStatistic from './dashboard/monthlyStatistic';

// operation
import Facility from './operation/facility';
import FacilityGroup from './operation/facilityGroup';
import Zone from './operation/zone';
import Item from './operation/item';
import WorkOrder from './operation/workOrder';

// timescale
import Log from './timescale/log';
import SystemLog from './timescale/systemLog';
import CallReserve from './common/callReserve';
import CallSpec from './common/callSpec';

export * from './sequelize';

const db = {
  /* common */
  CommonCode,
  User,
  TokenHistory,
  File,
  EventHistory,
  Setting,
  AlarmEmail,
  McsAlarm,
  Amr,
  ErrorCode,
  MenuRole,
  QnaQuestion,
  QnaAnswer,
  QnaQuestionFileJoin,
  QnaAnswerFileJoin,
  /* dashboard */
  DailyStatistic,
  MonthlyStatistic,
  /* operation */
  Facility,
  FacilityGroup,
  Zone,
  Item,
  WorkOrder,
  /* timescale */
  Log,
  SystemLog,
  CallReserve,
  CallSpec,
};

export type dbType = typeof db;

// 모든 테이블의 관계 설정은 이곳에 한다. (Model파일에 설정할 경우 순환 참조 발생 함)
// 'belongsTo'관계는 반드시 표현할 것

/* common */
// AlarmEmail
AlarmEmail.belongsTo(User, { foreignKey: { name: 'UserId' }, onDelete: 'SET NULL', as: 'User' });

// Alarm

/* operation */
// Facility
Facility.belongsTo(FacilityGroup, {
  foreignKey: { name: 'facilityGroupId' },
  onDelete: 'SET NULL',
  as: 'FacilityGroup',
});

// WorkOrder
WorkOrder.belongsTo(Facility, { foreignKey: { name: 'fromFacilityId' }, onDelete: 'SET NULL', as: 'FromFacility' });
WorkOrder.belongsTo(Facility, { foreignKey: { name: 'toFacilityId' }, onDelete: 'SET NULL', as: 'ToFacility' });
WorkOrder.belongsTo(Item, { foreignKey: { name: 'itemId' }, onDelete: 'SET NULL', as: 'Item' });
WorkOrder.belongsTo(Amr, { foreignKey: { name: 'fromAmrId' }, onDelete: 'SET NULL', as: 'Amr' });

/* Q&A */
User.hasMany(QnaQuestion, { foreignKey: 'userId' });
User.hasMany(QnaAnswer, { foreignKey: 'userId' });

QnaQuestion.belongsTo(User, { foreignKey: 'userId' });
QnaQuestion.hasMany(QnaAnswer, { foreignKey: 'questionId', as: 'Answers' });
QnaQuestion.belongsToMany(File, {
  through: QnaQuestionFileJoin,
  foreignKey: 'questionId',
  otherKey: 'fileId',
  as: 'Files',
});

QnaAnswer.belongsTo(User, { foreignKey: 'userId' });
QnaAnswer.belongsTo(QnaQuestion, { foreignKey: 'questionId' });
QnaAnswer.belongsToMany(File, {
  through: QnaAnswerFileJoin,
  foreignKey: 'answerId',
  otherKey: 'fileId',
  as: 'Files',
});
