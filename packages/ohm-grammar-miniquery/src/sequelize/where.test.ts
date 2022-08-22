import { toMiniQueryAST } from '../ast';
import { toSequelizeWhere } from './where';
import { DataTypes, Sequelize } from '@sequelize/core';
import test from 'ava';

test('sequelize where', async (t) => {
  let sequelize = new Sequelize('sqlite::memory:');
  let User = await sequelize.define('User', {
    username: {
      type: DataTypes.STRING,
    },
    name: {
      type: DataTypes.STRING,
    },
    age: {
      type: DataTypes.INTEGER,
    },
    attributes: {
      type: DataTypes.JSON,
    },
    profile_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Profile',
        key: 'id',
      },
    },
  });
  let Profile = await sequelize.define('Profile', {
    wechat: {
      type: DataTypes.STRING,
    },
    attributes: {
      type: DataTypes.JSON,
    },
  });
  User.hasOne(Profile);
  Profile.belongsTo(User);

  await User.sync();
  await Profile.sync();

  for (const s of [
    `age > -1.1`,
    `length(name) > length(username)`,
    `name = 'wener' and age > 18 and age < 80`,
    `name = 'wener' and (age > 18 or age < 80)`,
    `age not between 18 and 80`,
    `date(User.createdAt) between '2020-01-01' and '2020-01-31' and length(name) > 1 and username is not null and name like 'wen%'`,
    `attributes.user.name = 'wener'`, // json
    `attributes.'user name' = 'wener'`, // json
    `attributes.'user.name' = 'wener'`, // 无法正确 escape
    `age > 0 and age > 0 and age > 0`, // should flatten
    // `profile.wechat is not null`, // association
  ]) {
    let filter: any;
    try {
      filter = toSequelizeWhere(s, {
        sequelize,
        Model: User,
      });
    } catch (e) {
      t.log(`MiniQuery: ${s}`);
      t.log(`AST`, toMiniQueryAST(s));
      throw e;
    }

    let sql = '';
    await User.findAll({
      // logging: t.log,
      logging: (s) => (sql = s.substring(s.indexOf('WHERE ') + 'WHERE '.length, s.length - 1)),
      where: filter,
      // include: [
      //   {
      //     model: Profile,
      //   },
      // ],
    });
    t.snapshot(sql, `Query: ${s}`);
    t.pass();
  }
});
