import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { suggestedQuestions } from '../../features/eventKiosk/consult';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { goBack } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';

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

  return (
    <KioskFrame
      brand={brand}
      hideChat
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
        </View>
        {choices.length ? <KioskButton label="공고 바꾸기" variant="soft" onPress={() => setPicking(value => !value)} testID="chat-switch" /> : null}
        <KioskButton label="돌아가기" variant="ghost" icon="arrow-back" onPress={() => goBack(evaluation ? '/event/results' : '/event')} />
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
          <View key={index} style={[styles.bubbleRow, message.role === 'user' && styles.bubbleRowUser]}>
            {message.role === 'assistant' ? <View style={styles.avatar}><MaterialIcons name="auto-awesome" size={22} color={k.colors.onPrimary} /></View> : null}
            <View style={[styles.bubble, message.role === 'user' ? styles.bubbleUser : styles.bubbleBot]} testID={`chat-message-${message.role}`}>
              <Text style={[styles.bubbleText, message.role === 'user' && { color: k.colors.onPrimary }]}>{message.text}</Text>
              {message.detail?.map(line => <Text key={line} style={styles.detail}>· {line}</Text>)}
            </View>
          </View>
        ))}
        {busy ? (
          <View style={styles.bubbleRow}>
            <View style={styles.avatar}><MaterialIcons name="auto-awesome" size={22} color={k.colors.onPrimary} /></View>
            <View style={[styles.bubble, styles.bubbleBot]}><ActivityIndicator color={k.colors.primary} /></View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.suggestions} testID="chat-suggestions">
        {suggestedQuestions(outcome).map(question => (
          <MotionPressable key={question} accessibilityRole="button" accessibilityLabel={question} onPress={() => send(question)} style={styles.suggestion} disabled={busy}>
            <Text style={styles.suggestionText}>{question}</Text>
          </MotionPressable>
        ))}
      </View>
      <Text style={styles.disclaimer}>입력하신 정보와 공고 규칙만으로 답해요. 상담에서 새로 말씀하신 내용은 이 상담에서만 쓰고, 끝나면 지워져요.</Text>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  context: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, backgroundColor: k.colors.lavender, flexWrap: 'wrap' },
  contextLabel: { ...k.type.caption, color: k.colors.textMuted },
  contextValue: { ...k.type.bodyLgStrong, color: k.colors.primary },
  picker: { gap: 8, marginTop: 12 },
  pick: { minHeight: k.touch, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: k.colors.surface, borderWidth: 2, borderColor: k.colors.surfaceHighest },
  pickText: { ...k.type.bodyStrong, color: k.colors.text },
  thread: { marginTop: 20, maxHeight: 640 },
  threadContent: { gap: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18, gap: 6 },
  bubbleBot: { backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.surfaceHigh, borderTopLeftRadius: 6 },
  bubbleUser: { backgroundColor: k.colors.primary, borderTopRightRadius: 6 },
  bubbleText: { ...k.type.bodyLg, color: k.colors.text },
  detail: { ...k.type.body, color: k.colors.textMuted },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  suggestion: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 999, backgroundColor: k.colors.primaryFixed },
  suggestionText: { ...k.type.bodyStrong, color: k.colors.primary },
  disclaimer: { ...k.type.caption, color: k.colors.textSubtle, marginTop: 16 },
  composer: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  input: { flex: 1, minHeight: k.touch, borderRadius: 16, borderWidth: 2, borderColor: k.colors.surfaceHighest, backgroundColor: k.colors.surface, paddingHorizontal: 20, ...k.type.bodyLg, color: k.colors.text },
});
