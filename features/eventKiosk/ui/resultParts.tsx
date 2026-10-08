import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { Pop } from '../../../components/motion/Pop';
import {
  BUCKET_LABELS,
  WANPAN_LEVEL_LABELS,
  type KioskBucket,
  type KioskOutcome,
  type OfficialScore,
  type OfficialScoreState,
  type WanpanIndicator,
} from '../evaluate';
import { humanize, humanizeAll, kioskStatusLabel, officialScoreStatusLabel } from '../presentation';
import { cautionLines, useListingExplanation } from '../experience/useExplanation';
import { useKioskStore } from '../useKioskStore';
import { KioskButton } from './controls';
import { chatPath, listingPath } from './navigation';
import { bucketTone, k } from './theme';

/** UNAVAILABLE 은 이유에 따라 다르게 읽는다. 규칙이 없으면 '분석 전', 공고·증빙 확인이 남았으면 '추가 확인 필요'. */
const statusText = (outcome: KioskOutcome): string => kioskStatusLabel(outcome.status, outcome.unavailableReason);

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
      <Text style={[k.type.label, { color: k.colors.primary }]}>{humanize(label)}</Text>
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
export function OfficialScoreStateBlock({ state, compact, title, note }: {
  state: Exclude<OfficialScoreState, { status: 'AVAILABLE' }>;
  compact?: boolean;
  /** 설명 계층이 정한 상태 이름('서류 확인 필요' 등). 없으면 기본 문구. */
  title?: string;
  note?: string;
}) {
  const stateTitle = title ?? officialScoreStatusLabel(state.status);
  return (
    <View
      style={[styles.official, compact && styles.blockCompact]}
      testID={`official-score-${state.status.toLowerCase()}`}
      accessibilityLabel={`공식 배점 ${stateTitle}`}
    >
      <View style={styles.blockHead}>
        <MaterialIcons name="gavel" size={20} color={k.colors.text} />
        <Text style={styles.blockTitle}>공식 배점</Text>
      </View>
      <Text style={styles.officialState}>{stateTitle}</Text>
      {compact ? null : <Text style={styles.blockNote}>{note ?? humanize(state.reason)}</Text>}
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
      {/* 담는 순간에만 짧게 눌렸다 펴진다. 뺄 때는 조용히. */}
      <Pop active={active}>
        <MaterialIcons name={active ? 'star' : 'star-border'} size={compact ? 24 : 28} color={active ? '#B26A00' : k.colors.textMuted} />
      </Pop>
      {/* 좁은 카드에서도 선택 상태를 글로 함께 보여 준다. */}
      <Text style={[compact ? k.type.label : k.type.bodyStrong, { color: active ? '#8A4900' : k.colors.textMuted }]}>
        {active ? (compact ? '담김' : '관심 공고에 담김') : (compact ? '담기' : '관심 공고 담기')}
      </Text>
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
  const explanation = useListingExplanation(outcome);
  const favorite = useKioskStore(state => state.favorites.includes(outcome.id));
  const cautions = cautionLines(explanation);
  const advantages = humanizeAll(outcome.advantages);
  return (
    <View style={[styles.card, favorite && styles.cardFavorite]} testID={`listing-card-${outcome.rank}`}>
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
          : <OfficialScoreStateBlock state={outcome.officialScoreState as Exclude<OfficialScoreState, { status: 'AVAILABLE' }>} title={explanation.score.title} compact />}
        <WanpanBlock wanpan={outcome.wanpan} compact />
      </View>
      {advantages.length ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>유리한 조건</Text>
          <Bullets items={advantages.slice(0, 2)} kind="good" />
        </View>
      ) : null}
      {cautions.length ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{outcome.status === 'INELIGIBLE' ? '충족하지 못한 조건' : '확인할 조건'}</Text>
          <Bullets items={cautions.slice(0, 2)} kind="caution" />
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
  tile: { flexGrow: 1, flexBasis: 220, minHeight: 132, borderRadius: 20, padding: 22, gap: 8, borderWidth: 2, borderColor: 'transparent', justifyContent: 'space-between' },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileLabel: { ...k.type.bodyLgStrong },
  tileValue: { ...k.type.metric },
  tileUnit: { ...k.type.section },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 999, alignSelf: 'flex-start' },
  badgeLarge: { minHeight: 48, paddingHorizontal: 18 },
  stage: { backgroundColor: k.colors.lavender },
  official: { flexGrow: 1, flexBasis: 180, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, gap: 4 },
  wanpan: { flexGrow: 1, flexBasis: 180, padding: 16, borderRadius: 12, backgroundColor: k.colors.lavender, gap: 6 },
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
  favorite: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: k.touch, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: k.colors.surfaceHighest, backgroundColor: k.colors.surface },
  favoriteActive: { borderColor: '#E7A64B', backgroundColor: '#FFF4E5' },
  favoriteCompact: { minWidth: k.touch, paddingHorizontal: 12, gap: 4, justifyContent: 'center' },
  bullets: { gap: 6 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletText: { ...k.type.body, color: k.colors.text, flex: 1 },
  card: { flexGrow: 1, flexBasis: 360, backgroundColor: k.colors.surface, borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: k.colors.outline },
  cardFavorite: { borderColor: '#E7A64B', borderWidth: 2 },
  cardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  rank: { width: 44, height: 44, borderRadius: 12, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
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
