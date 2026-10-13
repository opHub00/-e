import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { BUCKET_LABELS } from '../../features/eventKiosk/evaluate';
import { experienceSuggestedQuestions } from '../../features/eventKiosk/experience/chatAnswers';
import { humanize } from '../../features/eventKiosk/presentation';
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
 * AI 상담. 일반 챗봇처럼 보이지만, 방문자가 입력한 정보·지금 공고·그 공고의 판정 결과를 이어받아
 * 결정론 상담 엔진이 답한다. 외부 언어 모델을 부르지 않는다.
 */
export default function ChatScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const chat = useKioskStore(state => state.chat);
  const busy = useKioskStore(state => state.chatBusy);
  const evaluation = useKioskStore(state => state.evaluation);
  const openChat = useKioskStore(state => state.openChat);
  const ask = useKioskStore(state => state.ask);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (attached && load.ok) openChat(load.event, id ?? null);
  }, [attached, id, load, openChat]);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [chat?.messages.length, busy]);

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  if (!attached || !chat) return <KioskFrame brand={brand} hideChat><View /></KioskFrame>;

  const outcome = evaluation?.outcomes.find(item => item.id === chat.context.outcomeId) ?? null;
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft('');
    void ask(load.event, text);
  };
  const choices = (evaluation?.outcomes ?? []).filter(item => item.id !== chat.context.outcomeId);
  const samdoFocus = chat.samdoRecommendation?.recommendedType
    ?? chat.samdoRecommendation?.alternatives[0]
    ?? chat.samdoRecommendation?.lowerPriorityTypes[0]
    ?? null;

  return (
    <KioskFrame
      brand={brand}
      hideChat
      partner={Boolean(chat.samdoRecommendation)}
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
      <View style={styles.context} testID="chat-context">
        <MaterialIcons name="push-pin" size={22} color={k.colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.contextLabel}>상담 기준</Text>
          <Text style={styles.contextValue} numberOfLines={2}>
            {chat.context.listingTitle ? `${chat.context.listingTitle} · ${chat.context.supplyLabel}` : '아직 분석 결과가 없어요'}
          </Text>
          {/* 어떤 결과를 기준으로 답하는지 늘 보이게 한다. */}
          {outcome ? (
            <Text style={styles.contextMeta} testID="chat-context-verdict">
              내 판정: {BUCKET_LABELS[outcome.bucket]}{outcome.stageLabel ? ` · ${humanize(outcome.stageLabel)}` : ''} · 입력하신 정보와 공고 근거 기준
            </Text>
          ) : samdoFocus ? (
            <Text style={styles.contextMeta} testID="chat-context-verdict">
              삼도 전용 판정 · {samdoFocus.stageLabel} · 경쟁률·당첨확률 미추정
            </Text>
          ) : null}
        </View>
        {choices.length ? <KioskButton label="공고 바꾸기" variant="soft" onPress={() => setPicking(value => !value)} testID="chat-switch" /> : null}
        <KioskButton label="돌아가기" variant="ghost" icon="arrow-back" onPress={() => goBack(chat.samdoRecommendation ? '/event/samdo' : evaluation ? '/event/results' : '/event')} />
      </View>
      {picking ? (
        <View style={styles.picker}>
          {choices.map(item => (
            <MotionPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.listing.title} ${item.supplyLabel}로 상담하기`}
              onPress={() => { setPicking(false); openChat(load.event, item.id); }}
              style={styles.pick}
            >
              <Text style={styles.pickText}>{item.rank}. {item.listing.title} · {item.supplyLabel}</Text>
            </MotionPressable>
          ))}
        </View>
      ) : null}

      <ScrollView ref={scroll} style={styles.thread} contentContainerStyle={styles.threadContent} testID="chat-thread">
        {chat.messages.map((message, index) => (
          // 새 메시지만 짧게 떠오른다. 이미 있던 메시지는 다시 움직이지 않는다(key 가 그대로라서).
          <Appear key={index} distance={travel.sm} style={[styles.bubbleRow, message.role === 'user' && styles.bubbleRowUser]}>
            {message.role === 'assistant' ? <ConsultantAvatar /> : null}
            <View style={[styles.bubble, message.role === 'user' ? styles.bubbleUser : styles.bubbleBot]} testID={`chat-message-${message.role}`}>
              <Text style={[styles.bubbleText, message.role === 'user' && { color: k.colors.onPrimary }]}>{message.text}</Text>
              {message.detail?.map(line => <Text key={line} style={styles.detail}>· {line}</Text>)}
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
        {(chat.samdoRecommendation ? [
          '왜 이 신청유형을 먼저 추천하나요?',
          '가장 중요한 조건은 무엇인가요?',
          '제가 확인해야 할 서류는 무엇인가요?',
          '다른 공급유형과 비교하면 어떤가요?',
          '근거가 된 공고문 항목은 무엇인가요?',
        ] : experienceSuggestedQuestions(outcome)).map(question => (
          <MotionPressable key={question} accessibilityRole="button" accessibilityLabel={question} onPress={() => send(question)} style={styles.suggestion} disabled={busy}>
            <Text style={styles.suggestionText}>{question}</Text>
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
  picker: { gap: 8, marginTop: 12 },
  pick: { minHeight: k.touch, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.outline },
  pickText: { ...k.type.bodyStrong, color: k.colors.text },
  thread: { marginTop: 20, maxHeight: 640 },
  threadContent: { gap: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 18, gap: 6 },
  bubbleBot: { backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHigh, borderTopLeftRadius: 6 },
  bubbleUser: { backgroundColor: k.colors.primary, borderTopRightRadius: 6 },
  bubbleText: { ...k.type.bodyLg, color: k.colors.text },
  detail: { ...k.type.body, color: k.colors.textMuted },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  suggestion: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 999, backgroundColor: k.colors.primaryFixed },
  suggestionText: { ...k.type.bodyStrong, color: k.colors.primary },
  disclaimer: { ...k.type.caption, color: k.colors.textSubtle, marginTop: 16 },
  composer: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: k.touch, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, paddingHorizontal: 20, ...k.type.bodyLg, color: k.colors.text },
});
