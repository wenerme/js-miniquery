import { MiniQueryASTNode, toMiniQueryAST } from '../ast';
import { col, fn, Model, ModelStatic, Op, Sequelize, where, WhereOptions } from '@sequelize/core';
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
};

export function toSequelizeWhere(s: string | MatchResult, o: ParseFilterOptions): WhereOptions {
  if (!s) {
    return {};
  }
  return toWhere(toMiniQueryAST(s), { functions: DefaultFunctions, ...o });
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

function toWhere(ast: MiniQueryASTNode, o: WhereContext): any {
  let current = o.current ?? {};
  const setOp = (left: MiniQueryASTNode, op: any, val: any) => {
    if (typeof op === 'string') {
      op = opOf(op);
    }
    let v: any;
    switch (left.type) {
      case 'identifier':
        v = current[left.name] ??= {};
        break;
      case 'call':
        let first = left.value[0];
        if (left.value.length !== 1) {
          throw new SyntaxError(`Expected 1 call args, got ${left.value.length}`);
        }
        let cn: string;
        switch (first.type) {
          case 'identifier':
            cn = first.name;
            break;
          case 'ref':
            cn = first.name.join('.');
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
      case 'ref':
        // 依然无法 escape `.`
        // https://sequelize.org/docs/v7/core-concepts/model-querying-basics/#querying-json
        // v = _.get(current, left.name);
        // if (!v) {
        //   v = {};
        //   _.set(current, left.name, v);
        // }
        v = current[left.name.join('.')] ??= {};
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
    case 'identifier':
      return col(ast.name);
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
