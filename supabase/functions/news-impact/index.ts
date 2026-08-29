// 구조화된 뉴스 영향 설명 전용 Gemini proxy.
// 자유 질문을 받지 않으며 기존 ai/eligibility 경계를 수정하거나 우회하지 않는다.
//   supabase secrets set GEMINI_API_KEY=...
//   supabase functions deploy news-impact

import {
  buildNewsImpactBriefing,
  formatNewsPersonalizationContextForPrompt,
  parseNewsImpactContext,
} from '../../../features/news/ai.ts';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `당신은 청약 준비 앱 '완판e'의 개인화 설명 도우미예요.
입력에는 기사 사실이 없고, 허용된 사용자 신호와 앱이 결정론적으로 계산한 관련성 및 기사 topic만 있어요.

반드시 지킬 것:
- 기사 내용, 정책 효과, 사건, 수치, 원인, 결과, 비교, 증감을 언급하거나 추정하지 않아요.
- relevanceExplanation은 profileSignals, relevance.level, relevance.reasons, articleTopics만 자연스럽게 연결해요.
- profileSignals.displayName이 있으면 relevanceExplanation에서 정확히 "displayName님" 형태로 한 번 불러요.
- displayName이 null이면 호칭 없이 자연스럽게 쓰고, 어떤 경우에도 "회원님"을 사용하지 않아요.
- articleTopics는 주제 표시일 뿐 정책이 시행되거나 혜택이 생겼다는 뜻으로 해석하지 않아요.
- 청약 자격, 공식 가점, 순위, 당첨 가능성을 계산하거나 추론하지 않아요.
- 뉴스 때문에 완판e 준비도 숫자가 달라진다고 말하지 않아요.
- relevanceExplanation, action 두 필드의 JSON 객체로만 답해요.
- action은 아래 문장 중 하나를 그대로 선택해요.
  "기사 원문을 확인해 보세요."
  "공식 공고를 확인해 보세요."
  "관심 지역을 확인해 보세요."
  "관심 지역의 공식 공고를 확인해 보세요."
  "관련 제도를 저장해 두세요."
  "향후 모집공고를 확인해 보세요."
  "기사 원문과 공식 공고를 확인해 보세요."
  "기사 원문과 관련 공식 공고를 확인해 보세요."
  "관련 제도를 저장해 두고 공식 공고를 확인해 보세요."`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    relevanceExplanation: { type: 'STRING' },
    action: { type: 'STRING' },
  },
  required: ['relevanceExplanation', 'action'],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST만 지원해요.' }, 405);

  let context: ReturnType<typeof parseNewsImpactContext> = null;
  try {
    const body = await request.json();
    context = parseNewsImpactContext(body?.context);
  } catch {
    return json({ error: '요청 형식을 읽을 수 없어요.' }, 400);
  }
  if (!context) return json({ error: '검증된 뉴스 context가 필요해요.' }, 400);

  const fallback = buildNewsImpactBriefing(null, context);
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return json({ ...fallback, usedFallback: true, fallbackReason: 'missing-ai-key' });
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: formatNewsPersonalizationContextForPrompt(context) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      console.error('news impact gemini error', response.status);
      return json({ ...fallback, usedFallback: true, fallbackReason: 'ai-unavailable' });
    }
    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const output = candidate?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('')
      .trim();
    if (!output || (candidate?.finishReason && candidate.finishReason !== 'STOP')) {
      return json({ ...fallback, usedFallback: true, fallbackReason: 'invalid-ai-response' });
    }

    const result = buildNewsImpactBriefing(output, context);
    const usedFallback = result.grounding.personalization === 'fallback';
    return json({
      ...result,
      usedFallback,
      ...(usedFallback ? { fallbackReason: 'invalid-or-unsafe-ai-response' } : {}),
    });
  } catch (error) {
    console.error('news impact proxy error', error instanceof Error ? error.message : 'unknown error');
    return json({ ...fallback, usedFallback: true, fallbackReason: 'ai-connection-failed' });
  }
});
