// 완판e Gemini proxy.
// 클라이언트는 Gemini API Key를 절대 갖지 않는다. 키는 이 함수의 환경변수에만 있다.
//
//   supabase secrets set GEMINI_API_KEY=...
//   supabase functions deploy ai

import {
  ELIGIBILITY_REPLY,
  formatEligibilityExplanationContext,
  isEligibilityExplanationContext,
  isEligibilityQuestion,
  type EligibilityExplanationContext,
} from './eligibility.ts';
import {
  buildListingFitExplanationFallback,
  formatListingFitExplanationContext,
  isListingFitExplanationContext,
  isSafeListingFitExplanation,
  type ListingFitExplanationContext,
} from '../../../features/listingFit/ai.ts';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Gemini의 역할을 '설명'으로 못박는다. 계산과 판정은 앱의 domain 함수가 이미 끝냈다. */
const SYSTEM_PROMPT = `당신은 청약 준비 앱 '완판e'의 설명 도우미예요.
당신의 역할은 계산이 아니라 설명이에요. 앱이 이미 계산해 둔 값을 사용자가 이해하도록 풀어서 말해주세요.

반드시 지킬 것:
- [사용자 상태]에 적힌 숫자만 사용해요. 새로운 숫자를 만들거나 추정하지 않아요.
- 점수, 청약 가점, 당첨 확률, 순위, 자격 충족 여부를 직접 계산하거나 판정하지 않아요.
- "몇 점이 오른다", "당첨 가능성이 높다" 같은 예측을 새로 만들지 않아요.
- 완판e 준비도는 서비스 내부 지표예요. 공식 청약 가점이나 당첨 확률이 아니라는 점을 필요할 때 짚어줘요.
- 실제 신청 조건은 공고마다 다르니, 확실하지 않으면 "공식 공고에서 확인해야 해요"라고 말해요.
- 법령이나 제도의 세부 요건을 단정하지 않아요.

청약 제도 언급 금지 (가장 중요):
- [사용자 상태]에 명시되지 않은 청약 제도 기준을 새로 언급하지 않아요.
- 1순위, 특별공급 자격, 청약 가점, 당첨 가능성, 신청 자격 충족 여부를 추론하거나 단정하지 않아요.
- 가입 기간이 늘어나는 것처럼 이미 계산된 변화는 설명해도 돼요.
  하지만 그 변화가 특정 청약 자격을 얻는 것으로 이어진다고 연결하지 않아요.
  예를 들어 "가입 2년이 돼요"까지는 말할 수 있지만,
  "2년이 되면 1순위가 돼요" 처럼 자격으로 연결하는 말은 하지 않아요.
- 자격에 대한 질문을 받으면 "정확한 자격은 해당 모집공고와 공식 기준 확인이 필요합니다"라고 안내해요.

[오늘의 학습]이 함께 오면:
- 그 문항의 정답과 해설을 사용자 상태에 맞춰 쉽게 풀어서 설명해요.
- 해설에 없는 제도 기준을 새로 덧붙이지 않아요.

말투:
- 한국어 해요체. 3~5문장. 20대가 처음 들어도 알아듣는 쉬운 말.
- 사용자를 이름으로 불러요.
- 전문 용어를 쓸 때는 바로 뒤에 한 줄로 풀어써요.
- 마지막에 지금 해볼 만한 행동 하나를 제안해요.`;

const ELIGIBILITY_EXPLANATION_RULES = `

[생애최초 분석 설명 모드]
- 아래 [확정된 분석 결과]는 앱의 deterministic rule engine이 만든 결과예요.
- status와 각 check의 분류를 변경하거나 재판정하지 마세요.
- 결과에 없는 조건, 숫자, 예외를 새로 만들지 마세요.
- raw profile을 추측하지 마세요.
- passedChecks, missingChecks, listingChecks, failedChecks를 사용자가 이해하기 쉽게 설명만 하세요.
- needs_information은 탈락이 아니라 미확인 정보라고 분명히 말하세요.
- needs_listing_confirmation은 모집공고 확인이 필요하다는 뜻으로만 설명하세요.`;

const LISTING_FIT_EXPLANATION_RULES = `

[공고별 개인 적합도 설명 모드]
- 아래 [확정된 공고별 참고 분석]은 앱의 deterministic rule engine이 만든 결과예요.
- status와 check status를 변경하거나 재판정하지 마세요.
- Personal Fit은 당첨 가능성이나 최종 신청 자격이 아니에요.
- 공고·프로필에서 제공되지 않은 조건, 점수, 확률, 경쟁률, 커트라인을 만들지 마세요.
- needs_information은 탈락이 아니라 미입력 정보예요.
- needs_listing_confirmation은 현재 데이터로 판단하지 않고 공고문에서 확인해야 한다는 뜻이에요.
- listing, checks, missingBundles, actions, disclaimer만 쉬운 말로 설명하세요.
- raw profile이나 숨겨진 식별자를 추측하지 마세요.
- 사용자 이름은 제공되지 않으므로 이름을 추측하거나 이름으로 부르지 마세요.`;

type Turn = { role: 'user' | 'model'; text: string };

/** 앱이 계산해서 보내는 학습 콘텐츠. 사용자 자유 입력이 아니다. */
type Lesson = { question: string; answer: boolean; explanation: string; personal: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST만 지원해요.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'GEMINI_API_KEY가 설정되지 않았어요.' }, 500);

  let question = '';
  let context = '';
  let history: Turn[] = [];
  let lesson: Lesson | null = null;
  let eligibility: EligibilityExplanationContext | null = null;
  let listingFit: ListingFitExplanationContext | null = null;
  try {
    const body = await req.json();
    question = String(body.question ?? '').trim();
    context = String(body.context ?? '').trim();
    history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    if (body.lesson && typeof body.lesson === 'object') {
      lesson = {
        question: String(body.lesson.question ?? '').slice(0, 300),
        answer: Boolean(body.lesson.answer),
        explanation: String(body.lesson.explanation ?? '').slice(0, 500),
        personal: String(body.lesson.personal ?? '').slice(0, 500),
      };
    }
    if (body.eligibility !== undefined) {
      if (!isEligibilityExplanationContext(body.eligibility)) {
        return json({ error: '자격 분석 결과 형식이 올바르지 않아요.' }, 400);
      }
      eligibility = body.eligibility;
    }
    if (body.listingFit !== undefined) {
      if (!isListingFitExplanationContext(body.listingFit)) {
        return json({ error: '공고별 참고 분석 결과 형식이 올바르지 않아요.' }, 400);
      }
      listingFit = body.listingFit;
    }
    if (eligibility && listingFit) {
      return json({ error: '설명 컨텍스트는 한 번에 하나만 보낼 수 있어요.' }, 400);
    }
  } catch {
    return json({ error: '요청 형식을 읽을 수 없어요.' }, 400);
  }

  if (!question) return json({ error: '질문이 비어 있어요.' }, 400);
  if (question.length > 500) return json({ error: '질문이 너무 길어요.' }, 400);

  // 자격 관련 질문은 Gemini 를 거치지 않고 고정 안내문으로 답한다.
  // 검사 대상은 사용자가 입력한 question 뿐이다.
  // lesson 은 앱이 만들어 보내는 학습 콘텐츠라 필터를 적용하지 않는다.
  if (!eligibility && !listingFit && isEligibilityQuestion(question)) {
    return json({ answer: ELIGIBILITY_REPLY, blocked: 'eligibility' });
  }

  const lessonBlock = lesson?.question
    ? `\n\n[오늘의 학습]\n문항: ${lesson.question}\n정답: ${lesson.answer ? '맞아요' : '아니에요'}` +
      `\n앱이 준비한 해설: ${lesson.explanation}\n앱이 준비한 개인화 설명: ${lesson.personal}`
    : '';
  const eligibilityBlock = eligibility
    ? `\n\n[확정된 분석 결과]\n${formatEligibilityExplanationContext(eligibility)}`
    : '';
  const listingFitBlock = listingFit
    ? `\n\n[확정된 공고별 참고 분석]\n${formatListingFitExplanationContext(listingFit)}`
    : '';

  const contents = [
    ...history
      .filter((t) => t && (t.role === 'user' || t.role === 'model') && t.text)
      .map((t) => ({ role: t.role, parts: [{ text: String(t.text).slice(0, 2000) }] })),
    {
      role: 'user',
      parts: [{ text: `[사용자 상태]\n${context}${lessonBlock}${eligibilityBlock}${listingFitBlock}\n\n[질문]\n${question}` }],
    },
  ];

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: eligibility
              ? SYSTEM_PROMPT + ELIGIBILITY_EXPLANATION_RULES
              : listingFit
                ? SYSTEM_PROMPT + LISTING_FIT_EXPLANATION_RULES
                : SYSTEM_PROMPT,
          }],
        },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 600,
          // gemini-2.5-flash 는 thinking 모델이라 사고 토큰이 maxOutputTokens 를 먹는다.
          // 끄지 않으면 답변이 몇 글자만 나오고 MAX_TOKENS 로 잘린다.
          // 계산은 앱의 domain 이 이미 끝냈고 여기서는 설명만 하므로 사고가 필요 없다.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      console.error('gemini error', res.status, await res.text());
      if (res.status === 429) {
        return json({ error: '요청이 잠시 몰렸어요. 1분쯤 뒤에 다시 시도해 주세요.' }, 429);
      }
      if (res.status === 503) {
        return json({ error: 'AI가 잠시 붐비고 있어요. 잠시 후 다시 시도해 주세요.' }, 503);
      }
      return json({ error: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const answer = candidate?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim();

    if (!answer) return json({ error: 'AI가 답변을 만들지 못했어요.' }, 502);
    // 문장이 잘린 답변을 그대로 보여주지 않는다.
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.error('gemini finishReason', candidate.finishReason, data?.usageMetadata);
      return json({ error: '답변이 중간에 끊겼어요. 다시 시도해 주세요.' }, 502);
    }
    if (listingFit && !isSafeListingFitExplanation(answer, listingFit)) {
      return json({ answer: buildListingFitExplanationFallback(listingFit), safeguarded: true });
    }
    return json({ answer });
  } catch (e) {
    console.error('proxy error', e);
    return json({ error: 'AI 연결에 실패했어요.' }, 502);
  }
});
