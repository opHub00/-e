// Dedicated newlywed selection endpoint. Existing ai contracts remain unchanged.
import { isNewlywedAiContext, parseNewlywedAiSelection, type NewlywedAiContext } from '../../../features/eligibility/newlywedAi.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function handleNewlywedAi(req: Request, apiKey: string | undefined, fetcher: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  // Gateway verify_jwt=true is required when deploying this endpoint.
  let context: NewlywedAiContext;
  try {
    const raw = await req.text();
    if (raw.length > 16_000) return json({ error: 'payload_too_large' }, 413);
    const body = JSON.parse(raw);
    if (!body || Object.keys(body).length !== 1 || !isNewlywedAiContext(body.newlywed)) return json({ error: 'invalid_context' }, 400);
    context = body.newlywed;
  } catch { return json({ error: 'invalid_request' }, 400); }
  if (!apiKey) return json({ selection: null, fallback: true });
  try {
    const res = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: '신혼부부 분석 설명을 위한 항목 선택기입니다. 입력은 이미 계산된 결과입니다. 확인할 항목 1~3개의 기존 key만 골라 {"checkKeys":["..."]} JSON으로 반환하세요. 정보 부족과 공고 확인 항목을 우선하세요. 새로운 판정, 확률, 점수, 숫자, 설명 문장을 생성하지 마세요. 입력의 status와 규정을 변경하지 마세요.' }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 1024,
          // This is bounded key selection. Dynamic thinking previously exhausted the 500-token
          // output budget and returned truncated JSON (finishReason=MAX_TOKENS).
          thinkingConfig: { thinkingBudget: 0 },
          responseSchema: {
            type: 'OBJECT', required: ['checkKeys'],
            properties: { checkKeys: { type: 'ARRAY', minItems: 1, maxItems: 3, items: { type: 'STRING', enum: context.checks.map(check => check.key) } } },
          },
        },
      }),
    });
    if (!res.ok) return json({ selection: null, fallback: true });
    const body = await res.json();
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') return json({ selection: null, fallback: true });
    const raw = candidate?.content?.parts?.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('');
    const selection = parseNewlywedAiSelection(JSON.parse(raw), context);
    return json({ selection, fallback: !selection });
  } catch { return json({ selection: null, fallback: true }); }
}
