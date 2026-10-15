import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
import { samdoRecommendationForAnswers } from '../../features/eventKiosk/samdoResult/samdoEvaluate';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';

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
 * AI 상담. 판정은 기존 deterministic engine 결과를 그대로 사용하고, 서버 LLM은 그 결과를 설명한다.
 * 서버 호출이 불가능하거나 안전 검사를 통과하지 못하면 기존 규칙형 답변으로 즉시 돌아간다.
 */
export default function ChatScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const phone = useKioskWidth() < 600;
  const chat = useKioskStore(state => state.chat);
  const busy = useKioskStore(state => state.chatBusy);
  const householdType = useKioskStore(state => state.answers.householdType);
  const openSamdoChat = useKioskStore(state => state.openSamdoChat);
  const ask = useKioskStore(state => state.ask);
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!attached || !load.ok || chat?.samdoRecommendation || !householdType) return;
    openSamdoChat(load.event, samdoRecommendationForAnswers(useKioskStore.getState().answers));
  }, [attached, chat?.samdoRecommendation, householdType, load, openSamdoChat]);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [chat?.messages.length, busy]);

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  if (!attached) return <KioskFrame brand={brand} hideChat partner><View /></KioskFrame>;
  if (!chat?.samdoRecommendation) {
    return (
      <KioskFrame brand={brand} hideChat partner confirmHome={false}>
        <EmptyState title="먼저 삼도이동 1지구 분석을 완료해 주세요" body="내 조건을 입력하면 공급유형별 판정 결과를 기준으로 상담해 드려요." action={{ label: '분석 시작하기', onPress: () => goBack('/event') }} />
      </KioskFrame>
    );
  }

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft('');
    void ask(load.event, text);
  };
  const samdoFocus = chat.samdoRecommendation?.recommendedType
    ?? chat.samdoRecommendation?.alternatives[0]
    ?? chat.samdoRecommendation?.lowerPriorityTypes[0]
    ?? null;

  return (
    <KioskFrame
      brand={brand}
      hideChat
      partner
      progress={{ label: 'AI 상담' }}
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
            style={styles.input}
            returnKeyType="send"
            maxLength={300}
          />
          <KioskButton testID="chat-send" label="보내기" icon="send" onPress={() => send(draft)} disabled={!draft.trim() || busy} />
        </View>
      }
    >
      <View style={[styles.context, phone && styles.contextPhone]} testID="chat-context">
        <MaterialIcons name="push-pin" size={22} color={k.colors.primary} />
        <View style={{ flex: 1 }}>
          <View style={styles.programPill} testID="chat-program"><Text style={styles.programPillText}>{DISTRICT_COPY.chatContext}</Text></View>
          <Text style={styles.contextLabel}>상담 기준</Text>
          <Text style={[styles.contextValue, phone && styles.contextValuePhone]} numberOfLines={2}>
            {chat.context.listingTitle ? `${chat.context.listingTitle} · ${chat.context.supplyLabel}` : '아직 분석 결과가 없어요'}
          </Text>
          {/* 어떤 결과를 기준으로 답하는지 늘 보이게 한다. */}
          {samdoFocus ? (
            <Text style={styles.contextMeta} testID="chat-context-verdict">
              삼도 전용 판정 · {samdoFocus.stageLabel} · 경쟁률·당첨확률 미추정
            </Text>
          ) : null}
        </View>
        <KioskButton label="돌아가기" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/samdo')} />
      </View>

      <ScrollView ref={scroll} style={styles.thread} contentContainerStyle={styles.threadContent} testID="chat-thread">
        {chat.messages.map((message, index) => (
          // 새 메시지만 짧게 떠오른다. 이미 있던 메시지는 다시 움직이지 않는다(key 가 그대로라서).
          <Appear key={index} distance={travel.sm} style={[styles.bubbleRow, message.role === 'user' && styles.bubbleRowUser]}>
            {message.role === 'assistant' ? <ConsultantAvatar /> : null}
            <View style={[styles.bubble, phone && styles.bubblePhone, message.role === 'user' ? styles.bubbleUser : styles.bubbleBot]} testID={`chat-message-${message.role}`}>
              {message.role === 'assistant' && message.response ? <SourceBadge mode={message.response.mode} /> : null}
              <Text style={[styles.bubbleText, phone && styles.bubbleTextPhone, message.role === 'user' && { color: k.colors.onPrimary }]}>{message.text}</Text>
              {message.detail?.length ? (
                <View style={styles.evidence} testID="chat-evidence">
                  <Text style={styles.evidenceTitle}>근거 · 확인할 내용</Text>
                  {message.detail.map(line => <Text key={line} style={[styles.detail, phone && styles.detailPhone]}>· {line}</Text>)}
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
        {[
          ...DISTRICT_COPY.chatSuggestions,
          '근거가 된 공고문 항목은 무엇인가요?',
        ].map(question => (
          <MotionPressable key={question} accessibilityRole="button" accessibilityLabel={question} onPress={() => send(question)} style={[styles.suggestion, phone && styles.suggestionPhone]} disabled={busy}>
            <Text style={[styles.suggestionText, phone && styles.suggestionTextPhone]}>{question}</Text>
          </MotionPressable>
        ))}
      </StaggerList>
      <Text style={styles.disclaimer}>입력하신 정보와 공고 규칙만으로 답해요. 상담에서 새로 말씀하신 내용은 이 상담에서만 쓰고, 끝나면 지워져요.</Text>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  context: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderRadius: 20, backgroundColor: k.colors.lavender, flexWrap: 'wrap' },
  contextLabel: { ...k.type.caption, color: k.colors.textMuted },
  contextValue: { ...k.type.bodyLgStrong, color: k.colors.primary },
  contextMeta: { ...k.type.caption, color: k.colors.textMuted, marginTop: 2 },
  thread: { marginTop: 20, maxHeight: 640 },
  threadContent: { gap: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 18, gap: 6 },
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
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  suggestion: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: k.colors.primaryFixed },
  programPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: k.colors.primary, marginBottom: 4 },
  programPillText: { ...k.type.caption, fontFamily: k.type.label.fontFamily, color: k.colors.onPrimary },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: k.tint.green.bg },
  sourceBadgeAi: { backgroundColor: k.colors.primaryFixed },
  sourceBadgeText: { ...k.type.caption, fontSize: 12, lineHeight: 16, fontFamily: k.type.label.fontFamily },
  evidence: { gap: 2, marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  evidenceTitle: { ...k.type.caption, fontSize: 12, lineHeight: 16, fontFamily: k.type.label.fontFamily, color: k.colors.textMuted },
  suggestionText: { ...k.type.bodyStrong, color: k.colors.primary },
  disclaimer: { ...k.type.caption, color: k.colors.textSubtle, marginTop: 16 },
  composer: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: k.touch, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, paddingHorizontal: 20, ...k.type.bodyLg, color: k.colors.text },
});
