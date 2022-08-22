# js-miniquery

SQL Where like filter expression for sequelize

- [More about MiniQuery](https://wener.me/notes/languages/miniquery)

## Sequelize

- Features
  - json field - `profile."user name" = "wener"`
  - function call - `date(createAt) between '2020-01-01' and '2020-01-31'``
  - to one association query - `profile.avatar.imageUrl is not null`
- Limitations
  - left side can not be a literal value
    - e.g. `1 > 1` is not supported

```ts
import {toSequelizeWhere} from 'ohm-grammar-miniquery/sequelize';

await User.findAll({
  // spread where & include
  ...toSequelizeWhere(`name like 'wen%' and age > 18 and profile.avatar.imageUrl is not null`),
});
```
