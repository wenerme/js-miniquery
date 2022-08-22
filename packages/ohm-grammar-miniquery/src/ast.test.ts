import { toMiniQueryAST } from './ast';
import test from 'ava';

test('miniquery ast', (t) => {
  for (const v of [`a > -1`]) {
    let ast = toMiniQueryAST(v);
    t.truthy(ast);
  }
});
