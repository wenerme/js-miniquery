# js-miniquery

SQL Where like filter expression for sequelize

## Sequelize

- Features
  - json field - `profile."user name" = "wener"`
  - function call - `date(createAt) between '2020-01-01' and '2020-01-31'`` 
- Limitations
  - left side can not be value
    - `1 > 1` is not supported

```ts
import {toSequelizeWhere} from 'ohm-grammar-miniquery/sequelize';

await User.findAll({
  where: toSequelizeWhere(`name like 'wen%' and age > 18`),
});
```
