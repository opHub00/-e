import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import {
  BUCKET_LABELS,
  WANPAN_LEVEL_LABELS,
  type KioskBucket,
  type KioskOutcome,
  type OfficialScore,
  type OfficialScoreState,
  type WanpanIndicator,
} from '../evaluate';
import { useKioskStore } from '../useKioskStore';
import { KioskButton } from './controls';
import { chatPath, listingPath } from './navigation';
import { bucketTone, k } from './theme';

/** UNAVAILABLE 은 이유에 따라 다르게 읽는다. 규칙이 없으면 '분석 전', 공고·증빙 확인이 남았으면 '추가 확인 필요'. */
const statusText = (outcome: KioskOutcome): string =>
  outcome.status === 'COMPLETE' ? '신청 가능'
    : outcome.status === 'INELIGIBLE' ? '신청 어려움'
    : outcome.unavailableReason === 'NO_ACTIVE_RULE_SET' ? '분석 전 공고'
    : '추가 확인 필요';

/** 대시보드 맨 위 세 칸. 멀리서도 숫자가 먼저 보이게. */
export function BucketTiles({ counts, selected, onSelect }: {
  counts: Record<KioskBucket, number>;
  selected: KioskBucket | null;
  onSelect: (bucket: KioskBucket | null) => void;
}) {
  return (
    <View style={styles.tiles} testID="bucket-tiles">
      {(Object.keys(BUCKET_LABELS) as KioskBucket[]).map(bucket => {
        const tone = bucketTone[bucket];
        const active = selected === bucket;
        return (
          <MotionPressable
            key={bucket}
            testID={`bucket-${bucket}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            aria-pressed={active}
            accessibilityLabel={`${BUCKET_LABELS[bucket]} ${counts[bucket]}개${active ? ', 선택됨' : ''}`}
            onPress={() => onSelect(active ? null : bucket)}
            style={[styles.tile, { backgroundColor: tone.bg }, active && { borderColor: tone.fg }]}
          >
            <View style={styles.tileHead}>
              <MaterialIcons name={tone.icon} size={28} color={tone.fg} />
              <Text style={[styles.tileLabel, { color: tone.fg }]}>{BUCKET_LABELS[bucket]}</Text>
            </View>
            <Text style={[styles.tileValue, { color: tone.fg }]}>{counts[bucket]}<Text style={styles.tileUnit}>개</Text></Text>
          </MotionPressable>
        );
      })}
    </View>
  );
}

export function StatusBadge({ outcome, large }: { outcome: KioskOutcome; large?: boolean }) {
  const tone = bucketTone[outcome.bucket];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }, large && styles.badgeLarge]}>
      <MaterialIcons name={tone.icon} size={large ? 24 : 20} color={tone.fg} />
      <Text style={[large ? k.type.bodyLgStrong : k.type.label, { color: tone.fg }]}>{statusText(outcome)}</Text>
    </View>
  );
}

export function StageBadge({ label }: { label: string }) {
  return (
    <View style={[styles.badge, styles.stage]}>
      <MaterialIcons name="flag" size={20} color={k.colors.primary} />
      <Text style={[k.type.label, { color: k.colors.primary }]}>{label}</Text>
    </View>
  );
}

/**
 * 공고 배점. 공고가 정한 배점표 그대로의 점수다. 숫자와 '점'을 쓴다.
 * 완판e 추천도와 한 줄에 같은 모양으로 두지 않는다.
 */
export function OfficialScoreBlock({ score, compact }: { score: OfficialScore; compact?: boolean }) {
  return (
    <View style={[styles.official, compact && styles.blockCompact]} testID="official-score" accessibilityLabel={`공고 배점 ${score.total}점, 만점 ${score.max}점`}>
      <View style={styles.blockHead}>
        <MaterialIcons name="gavel" size={20} color={k.colors.text} />
        <Text style={styles.blockTitle}>공고 배점</Text>
      </View>
      <Text style={styles.officialValue}>
        {score.total}<Text style={styles.officialMax}> / {score.max}점</Text>
      </Text>
      {compact ? null : <Text style={styles.blockNote}>모집공고 배점표로 계산한 점수예요.</Text>}
    </View>
  );
}

/** 공식 배점이 없거나 아직 계산할 수 없을 때 0점으로 보이지 않게 상태를 그대로 표시한다. */
export function OfficialScoreStateBlock({ state, compact }: { state: Exclude<OfficialScoreState, { status: 'AVAILABLE' }>; compact?: boolean }) {
  const unavailable = state.status === 'NOT_APPLICABLE';
  return (
    <View
      style={[styles.official, compact && styles.blockCompact]}
      testID={`official-score-${state.status.toLowerCase()}`}
      accessibilityLabel={unavailable ? '공식 배점 해당 없음' : '공식 배점 계산 정보 확인 필요'}
    >
      <View style={styles.blockHead}>
        <MaterialIcons name="gavel" size={20} color={k.colors.text} />
        <Text style={styles.blockTitle}>공식 배점</Text>
      </View>
      <Text style={styles.officialState}>{unavailable ? '해당 없음' : '정보 확인 필요'}</Text>
      {compact ? null : <Text style={styles.blockNote}>{state.reason}</Text>}
    </View>
  );
}

/** 완판e 추천도. 숫자 대신 수준과 막대로. 공고 점수가 아니라는 것을 늘 함께 적는다. */
export function WanpanBlock({ wanpan, compact }: { wanpan: WanpanIndicator; compact?: boolean }) {
  const label = WANPAN_LEVEL_LABELS[wanpan.level];
  return (
    <View style={[styles.wanpan, compact && styles.blockCompact]} testID="wanpan-indicator" accessibilityLabel={`완판e 추천도 ${label}. 공고 점수가 아니에요.`}>
      <View style={styles.blockHead}>
        <MaterialIcons name="auto-awesome" size={20} color={k.colors.primary} />
        <Text style={[styles.blockTitle, { color: k.colors.primary }]}>완판e 추천도</Text>
      </View>
      <Text style={styles.wanpanValue}>{label}</Text>
      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${Math.max(4, wanpan.value)}%` }, wanpan.level === 'none' && styles.meterNone]} />
      </View>
      {compact ? null : <Text style={styles.blockNote}>여러 공고를 비교하려고 완판e가 정한 순서예요. 공고 점수가 아니에요.</Text>}
    </View>
  );
}

export function FavoriteToggle({ outcomeId, compact }: { outcomeId: string; compact?: boolean }) {
  const active = useKioskStore(state => state.favorites.includes(outcomeId));
  const toggle = useKioskStore(state => state.toggleFavorite);
  return (
    <MotionPressable
      testID={`favorite-${outcomeId}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={active}
      accessibilityLabel={active ? '관심 공고에서 빼기' : '관심 공고에 담기'}
      onPress={() => toggle(outcomeId)}
      style={[styles.favorite, active && styles.favoriteActive, compact && styles.favoriteCompact]}
    >
      <MaterialIcons name={active ? 'star' : 'star-border'} size={28} color={active ? '#B26A00' : k.colors.textMuted} />
      {compact ? null : <Text style={[k.type.bodyStrong, { color: active ? '#8A4900' : k.colors.textMuted }]}>{active ? '관심 공고' : '관심 담기'}</Text>}
    </MotionPressable>
  );
}

function Bullets({ items, kind }: { items: string[]; kind: 'good' | 'caution' }) {
  if (!items.length) return null;
  const good = kind === 'good';
  return (
    <View style={styles.bullets}>
      {items.map(item => (
        <View key={item} style={styles.bullet}>
          <MaterialIcons name={good ? 'check' : 'priority-high'} size={20} color={good ? k.tint.green.fg : k.tint.amber.fg} />
          <Text style={styles.bulletText} numberOfLines={2}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** 결과 목록의 카드 한 장. 공고 + 공급 하나. */
export function ListingCard({ outcome }: { outcome: KioskOutcome }) {
  const { listing } = outcome;
  return (
    <View style={styles.card} testID={`listing-card-${outcome.rank}`}>
      <View style={styles.cardTop}>
        <View style={styles.rank}><Text style={styles.rankText}>{outcome.rank}</Text></View>
        <View style={styles.cardTitleBox}>
          <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {outcome.supplyType ? `${outcome.supplyLabel} · ` : ''}{listing.housingType} · {listing.district}
          </Text>
        </View>
        <FavoriteToggle outcomeId={outcome.id} compact />
      </View>
      <View style={styles.badges}>
        <StatusBadge outcome={outcome} />
        {outcome.stageLabel ? <StageBadge label={outcome.stageLabel} /> : null}
      </View>
      <View style={styles.scores}>
        {outcome.officialScore
          ? <OfficialScoreBlock score={outcome.officialScore} compact />
          : <OfficialScoreStateBlock state={outcome.officialScoreState as Exclude<OfficialScoreState, { status: 'AVAILABLE' }>} compact />}
        <WanpanBlock wanpan={outcome.wanpan} compact />
      </View>
      {outcome.advantages.length ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>유리한 조건</Text>
          <Bullets items={outcome.advantages.slice(0, 2)} kind="good" />
        </View>
      ) : null}
      {outcome.cautions.length ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>주의할 조건</Text>
          <Bullets items={outcome.cautions.slice(0, 2)} kind="caution" />
        </View>
      ) : null}
      <View style={styles.cardActions}>
        <KioskButton label="자세히 보기" icon="chevron-right" onPress={() => router.push(listingPath(outcome.id) as never)} testID={`detail-${outcome.rank}`} />
        <KioskButton label="AI에게 묻기" icon="forum" variant="soft" onPress={() => router.push(chatPath(outcome.id) as never)} />
      </View>
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.empty} testID="kiosk-empty">
      <MaterialIcons name="inbox" size={56} color={k.colors.outline} />
      <Text style={[k.type.title, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[k.type.bodyLg, { color: k.colors.textMuted, textAlign: 'center' }]}>{body}</Text>
      {action ? <KioskButton label={action.label} onPress={action.onPress} large /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  tile: { flexGrow: 1, flexBasis: 220, minHeight: 140, borderRadius: 24, padding: 22, gap: 8, borderWidth: 3, borderColor: 'transparent', justifyContent: 'space-between' },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileLabel: { ...k.type.bodyLgStrong },
  tileValue: { ...k.type.metric },
  tileUnit: { ...k.type.section },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 999, alignSelf: 'flex-start' },
  badgeLarge: { minHeight: 48, paddingHorizontal: 18 },
  stage: { backgroundColor: k.colors.lavender },
  official: { flexGrow: 1, flexBasis: 200, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: k.colors.text, backgroundColor: k.colors.surface, gap: 4 },
  wanpan: { flexGrow: 1, flexBasis: 200, padding: 16, borderRadius: 16, backgroundColor: k.colors.lavender, gap: 6 },
  blockCompact: { padding: 14 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockTitle: { ...k.type.label, color: k.colors.text },
  blockNote: { ...k.type.caption, color: k.colors.textMuted },
  officialValue: { ...k.type.title, color: k.colors.text },
  officialMax: { ...k.type.bodyLgStrong, color: k.colors.textMuted },
  officialState: { ...k.type.bodyLgStrong, color: k.colors.text },
  wanpanValue: { ...k.type.section, color: k.colors.primary },
  meter: { height: 10, borderRadius: 5, backgroundColor: k.colors.surface, overflow: 'hidden' },
  meterFill: { height: 10, borderRadius: 5, backgroundColor: k.colors.primary },
  meterNone: { backgroundColor: k.colors.outline },
  favorite: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: k.touch, paddingHorizontal: 18, borderRadius: 16, borderWidth: 2, borderColor: k.colors.surfaceHighest, backgroundColor: k.colors.surface },
  favoriteActive: { borderColor: '#E7A64B', backgroundColor: '#FFF4E5' },
  favoriteCompact: { width: k.touch, paddingHorizontal: 0, justifyContent: 'center' },
  bullets: { gap: 6 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletText: { ...k.type.body, color: k.colors.text, flex: 1 },
  card: { flexGrow: 1, flexBasis: 420, backgroundColor: k.colors.surface, borderRadius: 24, padding: 24, gap: 16, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  cardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  rank: { width: 44, height: 44, borderRadius: 22, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  rankText: { ...k.type.bodyLgStrong, color: k.colors.onPrimary },
  cardTitleBox: { flex: 1, gap: 4 },
  cardTitle: { ...k.type.section, color: k.colors.text },
  cardMeta: { ...k.type.body, color: k.colors.textMuted },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  scores: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  group: { gap: 6 },
  groupTitle: { ...k.type.label, color: k.colors.textMuted },
  cardActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  empty: { alignItems: 'center', gap: 16, paddingVertical: 64, paddingHorizontal: 24 },
});
