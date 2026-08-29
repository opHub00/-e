import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Appear } from './motion/Appear';
import { MotionPressable } from './motion/MotionPressable';
import { colors, radius, tint, type } from '../design/tokens';
import type { NewsBriefingState, RankedNews } from '../features/news/useNewsBriefing';
import type { NewsTopic } from '../features/news/types';

const TOPIC_LABEL: Record<NewsTopic, string> = {
  subscription: '청약',
  housing_policy: '주거 정책',
  youth: '청년 주거',
  special_supply: '특별공급',
  housing_market: '주택 시장',
  finance: '금융',
};

const topicLabel = (topics: NewsTopic[]) =>
  topics.length > 0 ? TOPIC_LABEL[topics[0]] : '주거 소식';

/** 오늘/어제/N일 전. 절대 날짜는 상세 시트에서 보여준다. */
function relativeDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

const LEVEL_LABEL = { high: '관련 높음', medium: '관련 있음', low: '참고' } as const;

type Props = {
  state: NewsBriefingState;
  onReload: () => void;
  onOpen: (item: RankedNews) => void;
  /** compact = Future 화면용. featured 없이 한 건만 간단히. */
  variant?: 'full' | 'compact';
};

export function NewsBriefingSection({ state, onReload, onOpen, variant = 'full' }: Props) {
  const compact = variant === 'compact';

  if (state.status === 'loading') {
    return (
      <Appear replayKey="loading" distance={0}>
        <View style={styles.statusBox}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.statusText}>최근 변화를 확인하는 중이에요…</Text>
        </View>
      </Appear>
    );
  }

  if (state.status === 'unconfigured') {
    return (
      <Appear replayKey="unconfigured" distance={0}>
        <View style={styles.statusBox}>
          <MaterialIcons name="cloud-off" size={17} color={colors.textSubtle} />
          <Text style={styles.statusText}>뉴스 연결이 아직 설정되지 않았어요.</Text>
        </View>
      </Appear>
    );
  }

  if (state.status === 'error') {
    return (
      <Appear replayKey="error" distance={0}>
        <View style={styles.statusBox}>
          <MaterialIcons name="wifi-off" size={17} color={colors.textSubtle} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusText}>최신 뉴스를 불러오지 못했어요.</Text>
            <Text style={styles.statusSub}>{state.message}</Text>
          </View>
          <MotionPressable
            accessibilityRole="button"
            onPress={onReload}
            style={styles.retryChip}
          >
            <Text style={styles.retryChipText}>다시</Text>
          </MotionPressable>
        </View>
      </Appear>
    );
  }

  if (state.ranked.length === 0) {
    return (
      <Appear replayKey="empty" distance={0}>
        <View style={styles.statusBox}>
          <MaterialIcons name="inbox" size={17} color={colors.textSubtle} />
          <Text style={styles.statusText}>지금 나와 관련 있는 변화는 없어요.</Text>
        </View>
      </Appear>
    );
  }

  const [featured, ...rest] = state.ranked;

  return (
    <Appear replayKey={`ready-${state.ranked[0].article.id}`} distance={0}>
      <View style={styles.block}>
      {state.isFallback ? (
        <View style={styles.fallbackNotice}>
          <MaterialIcons name="info-outline" size={14} color={tint.amber.fg} />
          <Text style={styles.fallbackText}>
            최신 뉴스를 불러오지 못했어요. 공식 확인 경로를 먼저 보여드릴게요.
          </Text>
        </View>
      ) : null}

      {/* featured: 이 섹션에서 유일하게 큰 블록 */}
      <MotionPressable
        accessibilityRole="button"
        onPress={() => onOpen(featured)}
        style={styles.featured}
      >
        <View style={styles.featuredTop}>
          <Text style={styles.featuredTopic}>{topicLabel(featured.article.topics)}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.featuredDay}>{relativeDay(featured.article.publishedAt)}</Text>
          <View style={styles.spacer} />
          <View
            style={[
              styles.levelChip,
              featured.relevance.level === 'high' && styles.levelChipHigh,
            ]}
          >
            <Text
              style={[
                styles.levelChipText,
                featured.relevance.level === 'high' && styles.levelChipTextHigh,
              ]}
            >
              {LEVEL_LABEL[featured.relevance.level]}
            </Text>
          </View>
        </View>

        <Text style={styles.featuredTitle} numberOfLines={3}>
          {featured.article.title}
        </Text>
        <Text style={styles.featuredSource}>{featured.article.sourceDomain}</Text>

        {!compact ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>왜 나와 관련 있을까요?</Text>
            <Text style={styles.reasonBody} numberOfLines={2}>
              {featured.relevance.reasons.join(' · ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.featuredCta}>
          <MaterialIcons name="auto-awesome" size={15} color={colors.primary} />
          <Text style={styles.featuredCtaText}>AI 분석 보기</Text>
          <View style={styles.spacer} />
          <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
        </View>
      </MotionPressable>

      {/* 나머지는 compact row. featured 와 위계를 다르게 한다. */}
      {!compact && rest.length > 0 ? (
        <View style={styles.restList}>
          {rest.slice(0, 3).map((item, index) => (
            <MotionPressable
              key={item.article.id}
              accessibilityRole="button"
              onPress={() => onOpen(item)}
              style={[
                styles.restRow,
                index > 0 && styles.restDivider,
              ]}
            >
              <View style={styles.restCopy}>
                <Text style={styles.restTitle} numberOfLines={2}>
                  {item.article.title}
                </Text>
                <Text style={styles.restMeta}>
                  {topicLabel(item.article.topics)} · {item.article.sourceDomain} ·{' '}
                  {relativeDay(item.article.publishedAt)}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={17} color={colors.outline} />
            </MotionPressable>
          ))}
        </View>
      ) : null}
      </View>
    </Appear>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  spacer: { flex: 1 },

  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  statusCopy: { flex: 1, gap: 2 },
  statusText: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  statusSub: { ...type.caption, color: colors.textSubtle },
  retryChip: {
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
  },
  retryChipText: { ...type.micro, color: colors.primary },

  fallbackNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: radius.cardSm,
    backgroundColor: tint.amber.bg,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  fallbackText: { ...type.caption, color: tint.amber.fg, flex: 1, lineHeight: 18 },

  featured: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 7,
  },
  featuredTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featuredTopic: { ...type.micro, color: colors.primary },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.outline },
  featuredDay: { ...type.micro, color: colors.textSubtle },
  levelChip: {
    height: 20,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
  },
  levelChipHigh: { backgroundColor: colors.lavender },
  levelChipText: { ...type.micro, color: colors.textSubtle },
  levelChipTextHigh: { color: colors.primary },

  featuredTitle: { ...type.cardTitle, color: colors.text, letterSpacing: -0.3, lineHeight: 23 },
  featuredSource: { ...type.caption, color: colors.textSubtle },

  reasonBox: {
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 3,
    marginTop: 2,
  },
  reasonLabel: { ...type.micro, color: colors.primary },
  reasonBody: { ...type.caption, color: colors.textMuted, lineHeight: 18 },

  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 10,
    marginTop: 2,
  },
  featuredCtaText: { ...type.bodySmStrong, color: colors.primary, letterSpacing: -0.2 },

  restList: { paddingHorizontal: 2 },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  restDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  restCopy: { flex: 1, gap: 3 },
  restTitle: { ...type.bodySm, color: colors.text, lineHeight: 20, letterSpacing: -0.2 },
  restMeta: { ...type.micro, color: colors.textSubtle },
});
