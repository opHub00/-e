import assert from 'node:assert/strict';
import { isServerRenderEnvironment, supabaseSessionStorage } from './authStorage.ts';

/*
  Static rendering used to crash here: with no window, the session storage fell
  through to the async-storage web build, which reads window when called.
  These run in plain Node, which is the same shape as the static render pass.
*/
assert.equal(isServerRenderEnvironment(), true, 'node render 환경으로 인식해야 한다');

// window 를 건드리지 않고 조용히 비어 있어야 한다.
assert.equal(await supabaseSessionStorage.getItem('wanpan-e:absent'), null);

// 서버 렌더에서도 읽기/쓰기가 예외 없이 끝나야 한다. 세션은 프로세스 밖으로 나가지 않는다.
await supabaseSessionStorage.setItem('wanpan-e:probe', 'value');
assert.equal(await supabaseSessionStorage.getItem('wanpan-e:probe'), 'value');
await supabaseSessionStorage.removeItem('wanpan-e:probe');
assert.equal(await supabaseSessionStorage.getItem('wanpan-e:probe'), null);

console.log('features/auth/authStorage: 5개 검증 통과');
