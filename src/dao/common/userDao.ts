import { Op } from 'sequelize';
import {
  InsertedResult,
  SelectedListResult,
  // SelectedAllResult,
  UpdatedResult,
  // DeletedResult,
  getOrderby,
  DeletedResult,
} from '../../lib/resUtil';
import User, {
  UserAttributes,
  UserInsertParams,
  UserSelectListParams,
  UserSelectListQuery,
  UserSelectInfoParams,
  UserSelectOneParams,
  UserUpdateParams,
  // UserDeleteParams,
  UserUpdatePasswordParams,
  UserLoginParams,
  UserLoginFailCountUpdateParams,
  UserDeleteParams,
} from '../../models/common/user';
import CommonCode, { CommonCodeAttributesInclude } from '../../models/common/commonCode';

const dao = {
  insert(params: UserInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      User.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: UserSelectListParams): Promise<SelectedListResult<UserAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: UserSelectListQuery = {};
    // 1. where조건 세팅
    if (params.userid) {
      setQuery.where = {
        ...setQuery.where,
        userid: params.userid, // '=' 검색
      };
    }
    if (params.name) {
      setQuery.where = {
        ...setQuery.where,
        name: { [Op.like]: `%${params.name}%` }, // 'like' 검색
      };
    }
    if (params.active) {
      setQuery.where = {
        ...setQuery.where,
        active: params.active, // true/false 검색
      };
    }

    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.order);

    return new Promise((resolve, reject) => {
      User.findAndCountAll({
        ...setQuery,
        where: {
          ...setQuery.where,
        },
        attributes: { exclude: ['password'] }, // 해당 필드 제외
        distinct: true,
        include: [],
      })
        .then((selectedList) => {
          resolve(selectedList);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfo(params: UserSelectInfoParams): Promise<UserAttributes | null> {
    return new Promise((resolve, reject) => {
      User.findByPk(params.id, {
        attributes: { exclude: ['password'] }, // 해당 필드 제외
        include: [],
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: UserUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      User.update(params, { where: { id: params.id } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateLastLogin(params: { id: number }): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      User.update(
        {
          lastLogin: new Date(),
          loginFailCount: 0,
        },
        { where: { id: params.id } }
      )
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateLastLogout(params: { id: number }): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      User.update(
        {
          lastLogout: new Date(),
        },
        { where: { id: params.id } }
      )
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updatePassword(params: UserUpdatePasswordParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      User.update(
        {
          password: params.password,
          updatedPassword: new Date(),
        },
        { where: { id: params.id } }
      )
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  // 로그인 전용 쿼리(login by id/password)
  selectUser(params: UserLoginParams): Promise<UserAttributes | null> {
    return new Promise((resolve, reject) => {
      User.findOne({
        attributes: ['id', 'userid', 'password', 'name', 'auth'],
        where: { userid: params.userid },
      })
        .then((selectedOne) => {
          resolve(selectedOne);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  // 로그인 실패 카운트 업데이트
  updateLoginFailCount(params: UserLoginFailCountUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      User.increment(
        {
          login_fail_count: params.loginFailCount,
        },
        { where: { id: params.id } }
      )
        .then((incrementedList) => {
          const updatedCount = Number(((incrementedList as unknown as Array<unknown>)[0] as Array<unknown>)[1]);
          resolve({ updatedCount });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectOne(params: UserSelectOneParams): Promise<UserAttributes | null> {
    return new Promise((resolve, reject) => {
      User.findOne({
        attributes: ['id', 'userid', 'password', 'name'],
        where: { id: params.id },
      })
        .then((selectedOne) => {
          resolve(selectedOne);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateUniqueForDelete(params: UserUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      User.findOne({
        where: { id: params.id },
      })
        .then((selectedOne) => {
          return User.update(
            {
              userid: `${selectedOne?.userid || ''}D${+new Date()}`,
            },
            {
              where: { id: params.id },
            }
          ).then(([updated]) => {
            resolve({ updatedCount: updated });
          });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: UserDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      User.destroy({
        where: {
          id: params.id,
        },
      })
        .then((deleted) => {
          resolve({ deletedCount: deleted });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export { dao };
