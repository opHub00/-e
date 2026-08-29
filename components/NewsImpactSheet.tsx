import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { duration } from '../design/motion';
import { colors, radius, spacing, tint, type } from '../design/tokens';
import { Appear } from './motion/Appear';
import { MotionPressable } from './motion/MotionPressable';
import { buildNewsImpactContext } from '../features/news/ai';
import type { NewsImpactBriefing, NewsImpactGrounding } from '../features/news/ai';
import type { NewsArticle, NewsRelevance } from '../features/news/types';
import type { UserProfile } from '../domain/types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const REQUEST_TIMEOUT_MS = 20_000;

type Props = {
  visible: boolean;
  profile: UserProfile;
  article: NewsArticle | null;
  relevance: NewsRelevance | null;
  onClose: () => void;
};

type SheetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      briefing: NewsImpactBriefing;
      grounding: NewsImpactGrounding;
      usedFallback: boolean;
    };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export function NewsImpactSheet({ visible, profile, article, relevance, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SheetState>({ status: 'idle' });

  const load = useCallback(async () => {
    if (!article || !relevance) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setState({ status: 'error', message: 'AI 연결이 설정되지 않았어요.' });
      return;
    }

    setState({ status: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const context = buildNewsImpactContext(profile, article, relevance);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/news-impact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || !data?.briefing) {
        throw new Error(data?.error ?? 'AI 분석을 받지 못했어요.');
      }
      setState({
        status: 'ready',
        briefing: data.briefing,
        grounding: data.grounding,
        usedFallback: Boolean(data.usedFallback),
      });
    } catch (error) {
      setState({
        status: 'error',
        message: controller.signal.aborted
          ? '응답이 늦어지고 있어요. 다시 시도해 주세요.'
          : error instanceof Error
            ? error.message
            : 'AI 분석을 받지 못했어요.',
      });
    } finally {
      clearTimeout(timer);
    }
  }, [article, profile, relevance]);

  useEffect(() => {
    if (visible) void load();
    else setState({ status: 'idle' });
  }, [visible, load]);

  if (!article || !relevance) return null;

  /** 기사 본문을 읽지 않고 제목·요약 메타만 쓴 경우. AI가 전문을 읽은 것처럼 보이면 안 된다. */
  const conservativeSummary =
    state.status === 'ready' && state.grounding?.factualSummary === 'fallback';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="닫기" />
      <Appear
        distance={24}
        durationMs={duration.sheet}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
      >
        <View style={styles.handle} />

        <View style={styles.headRow}>
          <Text style={styles.headTitle}>AI 영향 브리핑</Text>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
            style={styles.closeButton}
          >
            <MaterialIcons name="close" size={18} color={colors.textMuted} />
          </MotionPressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ── 기사 영역: 사실. 중립 회색 표면 ── */}
          <View style={styles.articleBlock}>
            <Text style={styles.articleLabel}>기사</Text>
            <Text style={styles.articleTitle}>{article.title}</Text>
            <View style={styles.articleMeta}>
              <Text style={styles.articleSource}>{article.sourceDomain}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.articleDate}>{formatDate(article.publishedAt)}</Text>
            </View>
            {article.summary ? (
              <Text style={styles.articleSummary} numberOfLines={3}>
                {article.summary}
              </Text>
            ) : null}
          </View>

          {state.status === 'loading' ? (
            <Appear replayKey="impact-loading" distance={0}>
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>내 상태와 맞춰 보는 중이에요…</Text>
              </View>
            </Appear>
          ) : null}

          {state.status === 'error' ? (
            <Appear replayKey="impact-error" distance={0}>
              <View style={styles.errorBlock}>
                <Text style={styles.errorTitle}>분석을 가져오지 못했어요</Text>
                <Text style={styles.errorBody}>{state.message}</Text>
                <MotionPressable
                  accessibilityRole="button"
                  onPress={() => void load()}
                  style={styles.retry}
                >
                  <Text style={styles.retryText}>다시 시도</Text>
                </MotionPressable>
              </View>
            </Appear>
          ) : null}

          {state.status === 'ready' ? (
            <Appear replayKey="impact-ready" distance={0}>
              <View>
              {/* ── AI 영역: 왼쪽 purple 레일로 기사와 구분 ── */}
              <View style={styles.aiBlock}>
                <View style={styles.aiRail} />
                <View style={styles.aiBody}>
                  <View style={styles.aiTag}>
                    <MaterialIcons name="auto-awesome" size={13} color={colors.primary} />
                    <Text style={styles.aiTagText}>완판e AI가 정리했어요</Text>
                  </View>

                  {state.briefing.headline.trim() !== article.title.trim() ? (
                    <Text style={styles.aiHeadline}>{state.briefing.headline}</Text>
                  ) : null}

                  <Text style={styles.blockLabel}>핵심 내용</Text>
                  <Text style={styles.blockBody}>{state.briefing.summary}</Text>
                  {conservativeSummary ? (
                    <Text style={styles.sourceNote}>
                      기사 전문이 아니라 제목과 요약만 확인했어요.
                    </Text>
                  ) : null}

                  <Text style={styles.blockLabel}>왜 나와 관련 있을까요?</Text>
                  <Text style={styles.blockBody}>{state.briefing.relevanceExplanation}</Text>

                  <View style={styles.actionBox}>
                    <Text style={styles.actionLabel}>지금 확인할 것</Text>
                    <Text style={styles.actionBody}>{state.briefing.action}</Text>
                  </View>

                  {state.briefing.caution ? (
                    <View style={styles.cautionBox}>
                      <MaterialIcons name="info-outline" size={14} color={tint.amber.fg} />
                      <Text style={styles.cautionText}>{state.briefing.caution}</Text>
                    </View>
                  ) : null}

                  {state.usedFallback ? (
                    <Text style={styles.sourceNote}>
                      AI 개인화를 쓰지 못해 기본 안내로 보여드리고 있어요.
                    </Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.policyNote}>
                이 브리핑은 준비도 계산에 반영되지 않아요. 자격·당첨 가능성은 판정하지 않아요.
              </Text>
              </View>
            </Appear>
          ) : null}
        </ScrollView>

        <MotionPressable
          accessibilityRole="link"
          accessibilityLabel="원문에서 자세히 확인"
          onPress={() => void Linking.openURL(article.originalUrl)}
          style={styles.originalCta}
        >
          <Text style={styles.originalCtaText}>원문에서 자세히 확인</Text>
          <MaterialIcons name="open-in-new" size={16} color={colors.onPrimary} />
        </MotionPressable>
      </Appear>
    </Modal>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(28,27,34,0.42)' },

  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: SIDE,
  },
  handle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighest,
    marginTop: 8,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 10,
  },
  headTitle: { ...type.bodyLgStrong, color: colors.text, letterSpacing: -0.3 },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },

  scroll: { paddingBottom: 14 },

  /* 기사 = 사실. 중립 표면. */
  articleBlock: {
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.cardSm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 6,
  },
  articleLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: 0.6 },
  articleTitle: { ...type.cardTitle, color: colors.text, letterSpacing: -0.3 },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  articleSummary: { ...type.caption, color: colors.textMuted, lineHeight: 19, marginTop: 2 },
  articleSource: { ...type.caption, color: colors.textMuted },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.outline },
  articleDate: { ...type.caption, color: colors.textSubtle },

  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 22 },
  loadingText: { ...type.bodySm, color: colors.textMuted },

  errorBlock: { paddingVertical: 18, gap: 6 },
  errorTitle: { ...type.bodySmStrong, color: colors.error },
  errorBody: { ...type.bodySm, color: colors.textMuted },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 6,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
  },
  retryText: { ...type.label, color: colors.primary },

  /* AI = 생성물. purple 레일로 기사와 구분. */
  aiBlock: { flexDirection: 'row', gap: 12, marginTop: 16 },
  aiRail: { width: 3, borderRadius: 2, backgroundColor: colors.primaryFixed },
  aiBody: { flex: 1, gap: 6 },
  aiTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiTagText: { ...type.micro, color: colors.primary },
  aiHeadline: { ...type.cardTitle, color: colors.text, letterSpacing: -0.3, marginBottom: 4 },
  blockLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: 0.4, marginTop: 8 },
  blockBody: { ...type.bodySm, color: colors.textMuted, lineHeight: 22 },
  sourceNote: { ...type.caption, color: colors.textSubtle, marginTop: 4 },

  actionBox: {
    marginTop: 12,
    borderRadius: radius.cardSm,
    backgroundColor: colors.lavender,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 3,
  },
  actionLabel: { ...type.micro, color: colors.primary, letterSpacing: 0.4 },
  actionBody: { ...type.bodySmStrong, color: colors.text, lineHeight: 21 },

  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 9,
    borderRadius: radius.cardSm,
    backgroundColor: tint.amber.bg,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  cautionText: { ...type.caption, color: tint.amber.fg, flex: 1, lineHeight: 18 },

  policyNote: { ...type.caption, color: colors.textSubtle, marginTop: 16, lineHeight: 18 },

  originalCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  originalCtaText: { ...type.bodySmStrong, fontSize: 15, color: colors.onPrimary },
});
