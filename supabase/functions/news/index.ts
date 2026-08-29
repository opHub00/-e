// Naver News server proxy. 두 credential은 이 Edge Function secret으로만 주입한다.
//   supabase secrets set NAVER_NEWS_CLIENT_ID=... NAVER_NEWS_CLIENT_SECRET=...
//   supabase functions deploy news

import { CuratedNewsProvider } from '../../../features/news/data/CuratedNewsProvider.ts';
import { NewsRepository } from '../../../features/news/data/NewsRepository.ts';
import { NaverNewsProvider } from '../../../features/news/server/NaverNewsProvider.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const now = () => new Date();
const repository = new NewsRepository({
  primaryProvider: new NaverNewsProvider({
    clientId: Deno.env.get('NAVER_NEWS_CLIENT_ID'),
    clientSecret: Deno.env.get('NAVER_NEWS_CLIENT_SECRET'),
    now,
  }),
  fallbackProvider: new CuratedNewsProvider({ now }),
  now,
  onPrimaryError: (diagnostic) => {
    // credential/원본 응답은 기록하지 않고 상태와 NAVER 오류 code만 남긴다.
    console.error('news primary provider fallback', diagnostic);
  },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // GET direct fetch와 Supabase client의 functions.invoke(POST)를 모두 지원한다.
  // body/query는 받지 않아 외부에서 Naver 검색어를 주입할 수 없다.
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'GET 또는 POST만 지원해요.' }, 405);
  }

  try {
    const dataset = await repository.loadNews();
    return json(dataset);
  } catch (error) {
    console.error('news provider error', error instanceof Error ? error.message : 'unknown error');
    return json({ error: '뉴스 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
  }
});
