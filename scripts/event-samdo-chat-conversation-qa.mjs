import { doesNotKnowPersona } from '../features/eventKiosk/phase4Personas.ts';
import { samdoInputFromAnswers } from '../features/eventKiosk/samdoResult/samdoInput.ts';
import { buildSamdoDualAssessment } from '../features/eventKiosk/samdoDual/evaluate.ts';
import { buildSamdoDualChatContext, resolveSamdoDualConversation } from '../features/eventKiosk/samdoDual/chat.ts';
import { getUnresolvedAssessmentFacts } from '../features/eventKiosk/samdoDual/unresolved.ts';

const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) throw new Error('Usage: node --experimental-strip-types scripts/event-chat-conversation-qa.mjs <preview-url>');

const assessment = buildSamdoDualAssessment(samdoInputFromAnswers(doesNotKnowPersona.answers));
const unresolvedFacts = getUnresolvedAssessmentFacts(assessment, doesNotKnowPersona.answerStates);

async function ask(question, history) {
  const local = resolveSamdoDualConversation(assessment, question, history, unresolvedFacts);
  const body = {
    question,
    history,
    context: buildSamdoDualChatContext(assessment, question, unresolvedFacts),
    fallback: local.answer,
    resolution: local.resolution,
  };
  const response = await fetch(`${baseUrl}/event-api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || typeof result?.text !== 'string') throw new Error(`Chat ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

const conversations = {
  A: ['내가 둘 다 신청 가능한지', '그럼 어떤 정보를 입력해야 확정적으로 추천해줄 수 있어?', '그중 제일 먼저 확인할 건?'],
  B: ['1지구와 2지구 차이가 뭐야?', '그러면 나한테는 어디가 더 맞아?', '왜?'],
  C: ['내가 지금 1순위로 대비해야 하는 건 뭐야?', '청약통장은 뭘 확인해야 돼?'],
  D: ['내가 모르는 것만 알려줘'],
};

const report = { preview: baseUrl, unresolvedCount: unresolvedFacts.length, conversations: {}, llmProbe: null };
for (const [id, questions] of Object.entries(conversations)) {
  const history = [];
  report.conversations[id] = [];
  for (const question of questions) {
    const result = await ask(question, history);
    report.conversations[id].push({ question, mode: result.mode, text: result.text, detail: result.detail ?? [], requestId: result.requestId ?? null });
    history.push({ role: 'user', text: question }, { role: 'assistant', text: result.text });
  }
}

report.llmProbe = await ask('토지임대부 분양주택에서 토지와 건물의 소유 관계를 공고문 근거로 설명해줘', []);
console.log(JSON.stringify(report, null, 2));
