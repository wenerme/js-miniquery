import { MiniQueryASTNode, toMiniQueryAST } from '../ast';
import {
  Association,
  col,
  DataType,
  DataTypes,
  fn,
  Includeable,
  IncludeOptions,
  Model,
  ModelStatic,
  Op,
  Sequelize,
  where,
  WhereOptions,
} from '@sequelize/core';
import { AbstractDataTypeConstructor } from '@sequelize/core/types/data-types';
import { MatchResult } from 'ohm-js';

export type ParseFilterOptions = {
  sequelize: Sequelize;
  Model: ModelStatic<Model>;
  // whitelist function calls
  functions?: Record<
    string,
    {
      arity?: number;
    }
  >;
};
type WhereContext = Omit<ParseFilterOptions, 'functions'> & {
  current?: any;
  functions: Record<
    string,
    {
      arity?: number;
    }
  >;
  include: Includeable[];
  associations: Association[];
};

export function toSequelizeWhere(
  s: string | MatchResult,
  o: ParseFilterOptions,
): { where: WhereOptions; include: IncludeOptions[] } {
  if (!s) {
    return {
      where: {},
      include: [],
    };
  }
  let ctx = { functions: DefaultFunctions, include: [], associations: [], ...o };
  let where = toWhere(toMiniQueryAST(s), ctx);
  ctx.include.push(...ctx.associations);
  return { where, include: ctx.include };
}

const DefaultFunctions: WhereContext['functions'] = {
  date: { arity: 1 },
  length: { arity: 1 },
};

function checkFunctions(name: string, args: any[] = [], o: WhereContext) {
  if (!o.functions[name]) {
    throw new Error(`Invalid function: ${name}`);
  }
}

function isSameType(a: DataType, b: AbstractDataTypeConstructor) {
  if (typeof a === 'string') {
    return a.toUpperCase() === b.key;
  }
  return a.key === b.key;
}

function resolve(parts: string[], c: WhereContext) {
  const { Model } = c;
  let M = Model;
  let rest = [...parts];

  let all: string[] = [];
  let isAssoc = false;
  let include: IncludeOptions | undefined = undefined;

  while (rest.length) {
    let first = rest.shift()!;
    const attr = M.getAttributes()[first];
    if (attr) {
      if (isSameType(attr.type, DataTypes.JSON) || isSameType(attr.type, DataTypes.JSONB)) {
        all.push(attr.field!);
        all.push(...rest);
        break;
      } else if (rest.length == 0) {
        all.push(attr.field!);
        break;
      } else {
        throw new SyntaxError(`Invalid ref of attr: ${parts.join('.')} type of ${attr.field} is ${attr.type}`);
      }
    } else if (rest.length === parts.length - 1) {
      // first
      // User.createdAt
      if (first === M.name) {
        // todo should add a prefix to prevent ambiguous
        // all.push(first)
        continue;
      }
    }

    let assoc = M.associations[first];
    if (assoc) {
      if (assoc.isMultiAssociation) {
        throw new Error(`Use has for multi association: ${parts.join('.')}`);
      }
      if (!include) {
        include = {
          association: assoc,
          required: true,
        };
        c.include.push(include);
      } else {
        // nested
        include.include = [
          {
            association: assoc,
            required: true,
          },
        ];
      }

      all.push(first);
      M = assoc.target;
      if (!rest.length) {
        throw new SyntaxError(`Invalid ref of an association: ${parts.join('.')}`);
      }
      isAssoc = true;
      continue;
    }

    throw new SyntaxError(`Invalid ref: ${parts.join('.')} of model ${M.name}`);
  }
  if (isAssoc) {
    return `$${all.join('.')}$`;
  }
  return all.join('.');
}

function toWhere(ast: MiniQueryASTNode, o: WhereContext): any {
  let current = o.current ?? {};
  const { Model } = o;

  function attrOfIdentifier(name: string) {
    // can support auto case convert

    let attr = Model.getAttributes()[name];
    if (!attr?.field) {
      throw new Error(`Invalid attribute: ${name}`);
    }
    return attr;
  }

  const setOp = (left: MiniQueryASTNode, op: any, val: any) => {
    if (typeof op === 'string') {
      op = opOf(op);
    }
    let v: any;
    switch (left.type) {
      case 'identifier':
        v = current[attrOfIdentifier(left.name).field!] ??= {};
        break;
      case 'call': {
        let first = left.value[0];
        if (left.value.length !== 1) {
          throw new SyntaxError(`Expected 1 call args, got ${left.value.length}`);
        }
        let cn: string;
        switch (first.type) {
          case 'identifier':
            cn = attrOfIdentifier(first.name).field!;
            break;
          case 'ref':
            // fixme hack replace
            cn = resolve(first.name, o).replaceAll(`$`, '`');
            break;
          default:
            throw new SyntaxError(`Expected identifier or ref for call, got ${first.type}`);
        }

        let name = left.name.toLowerCase();
        checkFunctions(name, [first], o);
        current = where(fn(name, col(cn)), {
          [op]: val,
        });
        return;
      }
      case 'ref':
        // 依然无法 escape `.`
        // https://sequelize.org/docs/v7/core-concepts/model-querying-basics/#querying-json
        // v = _.get(current, left.name);
        // if (!v) {
        //   v = {};
        //   _.set(current, left.name, v);
        // }
        v = current[resolve(left.name, o)] ??= {};
        break;
      default:
        throw new SyntaxError(`Expected identifier, ref or call for left side, got ${left.type}`);
    }
    v[op] = val;
  };

  switch (ast.type) {
    case 'rel':
      {
        setOp(ast.a, ast.op, toWhere(ast.b, { ...o }));
      }
      break;
    case 'between':
      {
        setOp(ast.a, ast.op, [toWhere(ast.b, { ...o }), toWhere(ast.c, { ...o })]);
      }
      break;
    case 'logic':
      {
        let op = opOf(ast.op);
        const c = (current[op] ??= []);
        // collect - flat - optimize
        let a = toWhere(ast.a, { ...o });
        if (a[op]) {
          c.push(...a[op]);
        } else {
          c.push(a);
        }
        let b = toWhere(ast.b, { ...o });
        if (b[op]) {
          c.push(...b[op]);
        } else {
          c.push(b);
        }
      }
      break;

    case 'paren':
      return [toWhere(ast.value, { ...o })];
    case 'int':
    case 'string':
    case 'float':
      return ast.value;
    case 'null':
      return null;
    case 'call':
      let name = ast.name.toLowerCase();
      checkFunctions(name, ast.value, o);
      return fn(name, ...ast.value.map((v) => toWhere(v, { ...o })));
    case 'identifier': {
      let attr = attrOfIdentifier(ast.name);
      return col(attr.field!);
    }
    default:
      throw new SyntaxError(`Invalid type: ${ast.type}`);
  }
  return current;
}

const OpMap: Record<string, string> = {
  'not between': 'notBetween',
  'not like': 'notLike',
  ilike: 'iLike',
  'not ilike': 'notILike',
  'not in': 'notIn',
  'is not': 'not',
};

function opOf(v: string) {
  let op = Op[(OpMap[v] || v) as 'any'];
  if (!op) {
    throw new SyntaxError(`Unsupported operator: ${v}`);
  }
  return op;
}
