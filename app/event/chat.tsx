import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { goBack } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { StaggerList } from '../../features/eventKiosk/motion/StaggerList';
import { BRAND } from '../../features/eventKiosk/brand/brandAssets';
import { useKioskWidth } from '../../features/eventKiosk/ui/useKioskWidth';
import { DISTRICT_COPY } from '../../features/eventKiosk/districts/districtCopy';
import { samdoInputFromAnswers } from '../../features/eventKiosk/samdoResult/samdoInput';
import { buildSamdoDualAssessment } from '../../features/eventKiosk/samdoDual/evaluate';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';
import { applySamdoResolvedFact } from '../../features/eventKiosk/samdoResult/samdoRefinement';
import { noticePlatform } from '../../features/eventKiosk/noticePlatform';
import { runCopilotTurn } from '../../features/productV3/copilot/service';
import type { AnswerStateMap } from '../../features/eventKiosk/questionPolicy';
import {
  buildCopilotSummary, copilotIntent, copilotOpenItems, copilotProgress, copilotRecommendationGroups, copilotWhatIf, nextCopilotQuestion, WHAT_IF_FACTS,
  type CopilotWhatIf, type CopilotWhatIfFact,
} from '../../features/eventKiosk/copilot/copilotModel';
import { CopilotProgressRow, CopilotQuestionCard, CopilotRecommendations, CopilotSummaryCard, CopilotWhatIfCard } from '../../features/eventKiosk/copilot/CopilotPanel';

/** Copilot 예시 질문. 화면 흐름(질문·할 일·가정)과 두 지구 비교 질문. 줄바꿈되어 가로 스크롤이 없다. */
const COPILOT_SUGGESTIONS = [
  '나한테 맞는 청약 찾아줘',
  '내가 아직 안 알려준 것만 물어봐',
  '내가 지금 가장 먼저 해야 할 일은?',
  '청약통장이 6회가 되면?',
  ...DISTRICT_COPY.chatSuggestions.slice(0, 2),
];

/** 답변 출처 표시. 판정·일정 데이터로 바로 답한 것과 AI 가 공고 근거로 쓴 답을 구분한다(로직은 서버 그대로). */
function SourceBadge({ mode }: { mode: 'llm' | 'deterministic' | 'fallback' }) {
  const ai = mode === 'llm';
  return (
    <View testID="chat-source-badge" style={[styles.sourceBadge, ai ? styles.sourceBadgeAi : null]}>
      <MaterialIcons name={ai ? 'auto-awesome' : 'fact-check'} size={14} color={ai ? k.colors.primary : k.colors.success} />
      <Text style={[styles.sourceBadgeText, { color: ai ? k.colors.primary : k.colors.success }]}>{ai ? 'AI 답변 · 공고 근거' : '공고 데이터 기반 답변'}</Text>
    </View>
  );
}

/** 답하는 쪽 표시: 완판이 상담원 이모티콘(원본). 원본이 없으면 기존 아이콘. */
function ConsultantAvatar() {
  return (
    <View style={styles.avatar} testID="chat-consultant-avatar">
      {BRAND.consultant
        ? <Image source={BRAND.consultant.source} style={{ height: 40, width: 40 * BRAND.consultant.ratio }} resizeMode="contain" accessibilityIgnoresInvertColors />
        : <MaterialIcons name="auto-awesome" size={22} color={k.colors.primary} />}
    </View>
  );
}

/**
 * Assessment Copilot. 판정·다음 질문 순서는 엔진(두 지구 판정 · 미해결 사실 순서) 그대로이고,
 * 서버 상담(LLM/fallback)은 내용 질문에만 쓴다. 화면 흐름 명령(모름·나중에·왜·가정)은 화면이 바로 처리한다.
 */
export default function ChatScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const width = useKioskWidth();
  const phone = width < 600;
  const wide = width >= 1100;
  const chat = useKioskStore(state => state.chat);
  const busy = useKioskStore(state => state.chatBusy);
  const answers = useKioskStore(state => state.answers);
  const answerStates = useKioskStore(state => state.answerStates);
  const openSamdoDualChat = useKioskStore(state => state.openSamdoDualChat);
  const ask = useKioskStore(state => state.ask);
  const applyRefinementAnswers = useKioskStore(state => state.applyRefinementAnswers);
  const markDoesNotKnow = useKioskStore(state => state.markDoesNotKnow);
  const appendLocalExchange = useKioskStore(state => state.appendLocalExchange);
  const refreshSamdoDualAssessment = useKioskStore(state => state.refreshSamdoDualAssessment);
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);
  // Copilot 화면 상태: 미룬 질문, 방금 처리 안내, '왜' 열림, 강조, 가정, 근거 펼침.
  const [deferred, setDeferred] = useState<string[]>([]);
  const [ack, setAck] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfFact, setWhatIfFact] = useState<CopilotWhatIfFact>(WHAT_IF_FACTS[0]);
  const [whatIf, setWhatIf] = useState<CopilotWhatIf | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<number[]>([]);
  // 지금 답 기준으로 다시 계산한 두 지구 판정(판정 자체는 엔진 그대로).
  const dual = useMemo(() => (answers.householdType ? buildSamdoDualAssessment(samdoInputFromAnswers(answers)) : null), [answers]);
  const copilot = useMemo(() => (dual ? {
    summary: buildCopilotSummary(dual, answerStates),
    question: nextCopilotQuestion(answers, answerStates, deferred),
    progress: copilotProgress(dual, answerStates),
    groups: copilotRecommendationGroups(dual),
    open: copilotOpenItems(dual, answerStates, deferred),
  } : null), [answers, answerStates, deferred, dual]);

  useEffect(() => {
    if (!attached || !load.ok || chat?.samdoRecommendation || chat?.samdoDualAssessment || !answers.householdType) return;
    openSamdoDualChat(load.event, buildSamdoDualAssessment(samdoInputFromAnswers(answers)));
  }, [answers, attached, chat?.samdoDualAssessment, chat?.samdoRecommendation, load, openSamdoDualChat]);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [chat?.messages.length, busy]);

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  if (!attached) return <KioskFrame brand={brand} hideChat partner><View /></KioskFrame>;
  if (!chat?.samdoRecommendation && !chat?.samdoDualAssessment) {
    return (
      <KioskFrame brand={brand} hideChat partner confirmHome={false}>
        <EmptyState title="먼저 삼도이동 1·2지구 분석을 완료해 주세요" body="내 조건을 입력하면 두 지구의 공급유형별 판정 결과와 공고 근거를 기준으로 상담해 드려요." action={{ label: '분석 시작하기', onPress: () => goBack('/event') }} />
      </KioskFrame>
    );
  }

  const question = copilot?.question ?? null;
  const resolveQuestion = (value: string | number | boolean) => {
    if (!question) return;
    const resolved = applySamdoResolvedFact(answers, question.factId, value);
    applyRefinementAnswers(resolved.answers, resolved.answerKeys);
    refreshSamdoDualAssessment(buildSamdoDualAssessment(samdoInputFromAnswers(resolved.answers)));
    setAck('반영했어요. 두 지구 판정을 다시 계산했어요.');
    setWhyOpen(false);
  };
  const unknownQuestion = () => {
    if (!question) return null;
    for (const key of question.answerKeys) markDoesNotKnow(key);
    setAck('확인 필요로 남겨둘게요.');
    setWhyOpen(false);
    return question;
  };
  const laterQuestion = () => {
    if (!question) return null;
    setDeferred(current => [...current, question.factId]);
    setAck('나중에 다시 물어볼게요.');
    setWhyOpen(false);
    return question;
  };
  const runWhatIf = (fact: CopilotWhatIfFact, value: string | number | boolean) => {
    setWhatIfFact(fact);
    setWhatIfOpen(true);
    setWhatIf(copilotWhatIf(answers, fact, value));
  };
  /** 화면 흐름 명령은 바로 처리하고(서버 호출 없음), 내용 질문은 서버 상담으로 보낸다. */
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft('');
    const intent = copilotIntent(text);
    const turn = dual ? runCopilotTurn(noticePlatform, {
      profile: { ...samdoInputFromAnswers(answers), answerStates },
      noticeIds: noticePlatform.getActiveNotices().map(notice => notice.id),
      conversation: chat.messages.map(message => ({ role: message.role, text: message.text })),
      question: text,
    }) : null;
    // 남은 질문이 없을 때: 모름·나중에로 남긴 항목이 있으면 그것부터, 없으면 서류·일정 안내.
    const open = copilot?.open ?? { unknown: [], deferred: [] };
    const leftover = open.deferred[0]
      ? `나중에 답하기로 한 "${open.deferred[0]}"가 남아 있어요.`
      : open.unknown[0]
        ? `모름으로 남긴 "${open.unknown[0]}"${open.unknown.length > 1 ? ` 외 ${open.unknown.length - 1}개` : ''}는 확인 필요로 판정했어요. 확인되면 결과 화면의 '추가로 확인하면' 목록에서 다시 입력해 주세요.`
        : null;
    const noQuestion = leftover ?? '판정에 필요한 정보는 지금 입력으로 모두 확인했어요. 남은 것은 서류 확인이에요.';
    if (intent.kind === 'RECOMMEND' && copilot) {
      setHighlight(true);
      const lines = turn?.assessments.map(item => {
        const title = noticePlatform.getNoticePresentation(item.noticeId).title;
        const chosen = item.recommendation.recommended;
        return `${title}: ${chosen ? `${chosen.supplyTypeLabel} · 신청 가능` : '확정 추천유형 없음'}`;
      }) ?? [];
      appendLocalExchange(text, { text: `현재 입력 기준의 두 공고 판정이에요.\n${lines.join('\n')}${question ? `\n"${question.title}"을 확인하면 판정이 더 정확해져요.` : ''}` });
      return;
    }
    if (intent.kind === 'COMPARE' && turn?.comparison) {
      const comparison = turn.comparison;
      const lines = comparison.notices.map(item => `${item.title}: ${item.recommendedSupplyType ?? '확정 추천유형 없음'} · 확인 필요 ${item.unresolvedCount}건`);
      appendLocalExchange(text, { text: `${lines.join('\n')}\n${comparison.reason}\n${comparison.disclaimer}` });
      return;
    }
    if (intent.kind === 'RESUME_DEFERRED') {
      setDeferred([]);
      appendLocalExchange(text, { text: open.deferred.length ? '미뤄 둔 질문을 다시 보여드릴게요.' : '미뤄 둔 질문은 없어요.' });
      return;
    }
    if (intent.kind === 'ASK_PENDING') {
      setHighlight(true);
      appendLocalExchange(text, { text: question ? `아직 확인하지 않은 것만 물어볼게요. "${question.title}"부터 답해 주세요.` : `지금 더 물어볼 질문은 없어요. ${noQuestion}` });
      return;
    }
    if (intent.kind === 'WHY') {
      setWhyOpen(true);
      appendLocalExchange(text, { text: question ? question.why : '지금은 먼저 물어볼 질문이 없어요.', detail: question ? [`확인 방법: ${question.help}`] : undefined });
      return;
    }
    if (intent.kind === 'DOES_NOT_KNOW' && question) {
      const asked = unknownQuestion()!;
      const nextStates: AnswerStateMap = { ...answerStates };
      for (const key of asked.answerKeys) nextStates[key] = 'DOES_NOT_KNOW';
      const next = dual ? nextCopilotQuestion(answers, nextStates, deferred) : null;
      appendLocalExchange(text, { text: `괜찮아요. "${asked.title}"는 확인 필요로 남겨둘게요.${next ? ` 다음으로 "${next.title}"를 확인해 볼게요.` : ''}` });
      return;
    }
    if (intent.kind === 'LATER' && question) {
      const asked = laterQuestion()!;
      appendLocalExchange(text, { text: `좋아요. "${asked.title}"는 나중에 다시 물어볼게요.` });
      return;
    }
    if ((intent.kind === 'DOES_NOT_KNOW' || intent.kind === 'LATER') && !question) {
      appendLocalExchange(text, { text: `지금 답할 질문은 없어요. ${noQuestion}` });
      return;
    }
    if (intent.kind === 'WHAT_IF') {
      const fact = WHAT_IF_FACTS.find(item => item.id === intent.factId) ?? WHAT_IF_FACTS[0];
      runWhatIf(fact, intent.value);
      appendLocalExchange(text, { text: `[가정] ${fact.label} ${intent.value}${fact.unit ?? ''}로 두 지구를 다시 계산했어요. '가정 결과'에서 현재 결과와 비교해 보세요. 내 정보는 바뀌지 않아요.` });
      return;
    }
    if (intent.kind === 'FIRST_TASK') {
      setHighlight(true);
      appendLocalExchange(text, { text: question ? `지금 가장 먼저 할 일은 "${question.title}"를 확인하는 거예요. ${question.why}` : (leftover ? `${leftover} 그다음 결과 화면의 준비 서류와 신청 일정을 확인해 주세요.` : '판정에 필요한 정보는 모두 확인했어요. 결과 화면의 준비 서류를 챙기고 신청 일정을 확인해 주세요.') });
      return;
    }
    void ask(load.event, text);
  };
  const dualPreferred = chat.samdoDualAssessment
    ? (chat.samdoDualAssessment.comparison.preferredDistrictId
        ? chat.samdoDualAssessment.districts.find(item => item.district.id === chat.samdoDualAssessment?.comparison.preferredDistrictId)
        : chat.samdoDualAssessment.districts[0])
    : null;
  const samdoFocus = dualPreferred?.recommendation.recommendedType
    ?? dualPreferred?.recommendation.alternatives[0]
    ?? dualPreferred?.recommendation.lowerPriorityTypes[0]
    ?? chat.samdoRecommendation?.recommendedType
    ?? chat.samdoRecommendation?.alternatives[0]
    ?? chat.samdoRecommendation?.lowerPriorityTypes[0]
    ?? null;
  const whatIfCard = (
    <CopilotWhatIfCard
      open={whatIfOpen}
      onOpen={() => setWhatIfOpen(true)}
      onClose={() => { setWhatIfOpen(false); setWhatIf(null); }}
      fact={whatIfFact}
      onFact={fact => { setWhatIfFact(fact); setWhatIf(null); }}
      result={whatIf}
      onRun={value => runWhatIf(whatIfFact, value)}
    />
  );

  return (
    <KioskFrame
      brand={brand}
      hideChat
      partner
      progress={{ label: 'AI 상담 · Copilot' }}
      footer={
        <View style={styles.composer}>
          <TextInput
            testID="chat-input"
            accessibilityLabel="질문 입력"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => send(draft)}
            placeholder="궁금한 점을 입력하세요"
            placeholderTextColor={k.colors.textSubtle}
            style={[styles.input, phone && styles.inputPhone]}
            returnKeyType="send"
            maxLength={300}
          />
          <KioskButton testID="chat-send" label="보내기" icon="send" onPress={() => send(draft)} disabled={!draft.trim() || busy} />
        </View>
      }
    >
      <View style={[styles.context, phone && styles.contextPhone]} testID="chat-context">
        <MaterialIcons name="push-pin" size={22} color={k.colors.primary} />
        <View style={styles.flex}>
          <View style={styles.programPill} testID="chat-program"><Text style={styles.programPillText}>{DISTRICT_COPY.chatContext}</Text></View>
          <Text style={styles.contextLabel}>상담 기준</Text>
          <Text style={[styles.contextValue, phone && styles.contextValuePhone]} numberOfLines={2}>
            {chat.context.listingTitle ? `${chat.context.listingTitle} · ${chat.context.supplyLabel}` : '아직 분석 결과가 없어요'}
          </Text>
          {/* 어떤 결과를 기준으로 답하는지 늘 보이게 한다. */}
          {samdoFocus ? (
            <Text style={styles.contextMeta} testID="chat-context-verdict">
              삼도 1·2지구 판정 · {samdoFocus.stageLabel} · 경쟁률·당첨확률 미추정
            </Text>
          ) : null}
        </View>
        <KioskButton label="돌아가기" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/samdo')} />
      </View>

      <View style={[styles.layout, wide && styles.layoutWide]}>
        {copilot ? (
          <View testID="copilot-panel" style={[styles.copilot, wide && styles.copilotWide]}>
            <CopilotSummaryCard summary={copilot.summary} />
            <CopilotQuestionCard
              question={copilot.question}
              ack={ack}
              whyOpen={whyOpen}
              onToggleWhy={() => setWhyOpen(value => !value)}
              onAnswer={resolveQuestion}
              onUnknown={() => { unknownQuestion(); }}
              onLater={() => { laterQuestion(); }}
              highlight={highlight}
              open={copilot.open}
              onResumeDeferred={() => setDeferred([])}
            />
            <CopilotProgressRow progress={copilot.progress} />
            {wide ? <CopilotRecommendations groups={copilot.groups} /> : null}
            {wide ? whatIfCard : null}
          </View>
        ) : null}
        <View style={styles.conversation}>
          <ScrollView ref={scroll} style={wide ? styles.threadWide : null} contentContainerStyle={styles.threadContent} testID="chat-thread">
            {chat.messages.map((message, index) => (
              // 새 메시지만 짧게 떠오른다. 이미 있던 메시지는 다시 움직이지 않는다(key 가 그대로라서).
              <Appear key={index} distance={travel.sm} style={[styles.bubbleRow, message.role === 'user' && styles.bubbleRowUser]}>
                {message.role === 'assistant' ? <ConsultantAvatar /> : null}
                <View style={[styles.bubble, phone && styles.bubblePhone, message.role === 'user' ? styles.bubbleUser : styles.bubbleBot]} testID={`chat-message-${message.role}`}>
                  {message.role === 'assistant' && message.response ? <SourceBadge mode={message.response.mode} /> : null}
                  <Text style={[styles.bubbleText, phone && styles.bubbleTextPhone, message.role === 'user' && { color: k.colors.onPrimary }]}>{message.text}</Text>
                  {message.detail?.length ? (
                    <View style={styles.evidence} testID="chat-evidence">
                      <View style={styles.evidenceHead}>
                        <MaterialIcons name="description" size={16} color={k.colors.textMuted} />
                        <Text style={[styles.evidenceTitle, styles.flex]}>확인할 내용</Text>
                      </View>
                      {message.detail.map(line => <Text key={line} style={[styles.detail, phone && styles.detailPhone]}>· {line}</Text>)}
                    </View>
                  ) : null}
                  {message.evidence?.length ? (
                    <View style={styles.evidence} testID="chat-evidence-sources">
                      <MotionPressable accessibilityRole="button" accessibilityLabel="공고문 근거 보기" onPress={() => setExpandedEvidence(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index])} style={styles.evidenceHead}>
                        <MaterialIcons name="description" size={16} color={k.colors.textMuted} />
                        <Text style={[styles.evidenceTitle, styles.flex]}>공고문 근거 {message.evidence.length}건 {expandedEvidence.includes(index) ? '접기' : '보기'}</Text>
                      </MotionPressable>
                      {expandedEvidence.includes(index) ? message.evidence.map((source, sourceIndex) => (
                        <Text key={`${source.noticeId}-${source.section}-${sourceIndex}`} style={[styles.detail, phone && styles.detailPhone]}>· {source.noticeTitle} · {source.section}: {source.summary}</Text>
                      )) : null}
                    </View>
                  ) : null}
                </View>
              </Appear>
            ))}
            {busy ? (
              <View style={styles.bubbleRow}>
                <ConsultantAvatar />
                <View style={[styles.bubble, styles.bubbleBot]}><ActivityIndicator color={k.colors.primary} /></View>
              </View>
            ) : null}
          </ScrollView>

          <StaggerList key={chat.context.outcomeId ?? 'none'} style={styles.suggestions} testID="chat-suggestions">
            {COPILOT_SUGGESTIONS.map(suggestion => (
              <MotionPressable key={suggestion} accessibilityRole="button" accessibilityLabel={suggestion} onPress={() => send(suggestion)} style={[styles.suggestion, phone && styles.suggestionPhone]} disabled={busy}>
                <Text style={[styles.suggestionText, phone && styles.suggestionTextPhone]}>{suggestion}</Text>
              </MotionPressable>
            ))}
          </StaggerList>
          {!wide && copilot ? (
            <View style={styles.after}>
              <CopilotRecommendations groups={copilot.groups} />
              {whatIfCard}
            </View>
          ) : null}
          <Text style={styles.disclaimer}>입력하신 정보와 공고 규칙만으로 답해요. 확률이나 당첨 가능성은 계산하지 않아요. 상담에서 새로 말씀하신 내용은 이 상담에서만 쓰고, 끝나면 지워져요.</Text>
        </View>
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderRadius: 20, backgroundColor: k.colors.lavender, flexWrap: 'wrap' },
  contextLabel: { ...k.type.caption, color: k.colors.textMuted },
  contextValue: { ...k.type.bodyLgStrong, color: k.colors.primary },
  contextMeta: { ...k.type.caption, color: k.colors.textMuted, marginTop: 2 },
  layout: { marginTop: 16, gap: 16 },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  copilot: { gap: 12 },
  copilotWide: { width: 420, flexShrink: 0 },
  conversation: { flex: 1, minWidth: 0 },
  after: { gap: 12, marginTop: 16 },
  threadWide: { maxHeight: 640 },
  threadContent: { gap: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 18, gap: 6, minWidth: 0 },
  bubbleBot: { backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHigh, borderTopLeftRadius: 6 },
  bubbleUser: { backgroundColor: k.colors.primary, borderTopRightRadius: 6 },
  bubbleText: { ...k.type.bodyLg, color: k.colors.text },
  bubbleTextPhone: { fontSize: 15, lineHeight: 22 },
  bubblePhone: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, maxWidth: '86%' },
  detailPhone: { fontSize: 13, lineHeight: 19 },
  contextPhone: { padding: 12, gap: 8, borderRadius: 16 },
  contextValuePhone: { fontSize: 16, lineHeight: 23 },
  suggestionPhone: { minHeight: 44, paddingHorizontal: 12 },
  suggestionTextPhone: { fontSize: 14, lineHeight: 20 },
  detail: { ...k.type.body, color: k.colors.textMuted },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  suggestion: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: k.colors.primaryFixed, maxWidth: '100%' },
  programPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: k.colors.primary, marginBottom: 4 },
  programPillText: { ...k.type.caption, fontFamily: k.type.label.fontFamily, color: k.colors.onPrimary },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: k.tint.green.bg },
  sourceBadgeAi: { backgroundColor: k.colors.primaryFixed },
  sourceBadgeText: { ...k.type.caption, fontSize: 12, lineHeight: 16, fontFamily: k.type.label.fontFamily },
  evidence: { gap: 2, marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  evidenceHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  evidenceTitle: { ...k.type.caption, fontSize: 12, lineHeight: 16, fontFamily: k.type.label.fontFamily, color: k.colors.textMuted },
  suggestionText: { ...k.type.bodyStrong, color: k.colors.primary },
  disclaimer: { ...k.type.caption, color: k.colors.textSubtle, marginTop: 16 },
  composer: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: k.touch, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, paddingHorizontal: 20, ...k.type.bodyLg, color: k.colors.text },
  inputPhone: { minHeight: 48, paddingHorizontal: 14, fontSize: 15 },
});
