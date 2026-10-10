import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDensity } from '../layout/DensityContext';
import { ListingThumb } from '../media/ListingMediaView';
import { bucketTone, k } from '../ui/theme';
import type { CardTone, ListingCardModel } from './listingCardModel';

/**
 * Listing Card V2 — 결과 목록·관심 공고·실시간 공고가 함께 쓰는 카드.
 *
 * 정보 순서(위 → 아래): 순위·썸네일·제목 → 판정 상태 → 위치·접수 일정·주변 → 공식 배점 / 완판e 추천(다른 모양) →
 * 유리한 조건 / 확인할 조건 → 행동. 데이터가 없는 줄은 빠진다.
 * 밀도에 따라 크기·간격만 바뀐다. desktop(compact) 에서는 한 화면에 카드가 더 많이 들어간다.
 *
 * 저장소·내비게이션은 모른다. 관심 담기와 행동 버튼은 바깥이 slot 으로 넣는다(Figma 교체 지점).
 */
type IconName = ComponentProps<typeof MaterialIcons>['name'];

const TONE: Record<CardTone, { bg: string; fg: string; icon: IconName }> = {
  eligible: bucketTone.eligible as { bg: string; fg: string; icon: IconName },
  review: bucketTone.review as { bg: string; fg: string; icon: IconName },
  difficult: bucketTone.difficult as { bg: string; fg: string; icon: IconName },
  info: { bg: k.tint.purple.bg, fg: k.tint.purple.fg, icon: 'info-outline' },
};

export function ListingCardV2({ model, favoriteSlot, actions, highlighted, testID }: {
  model: ListingCardModel;
  favoriteSlot?: ReactNode;
  actions?: ReactNode;
  /** 관심 공고처럼 사용자가 고른 카드. 테두리로만 표시한다. */
  highlighted?: boolean;
  testID?: string;
}) {
  const { d, density } = useDensity();
  const tone = TONE[model.status.tone];
  const compact = density === 'compact';
  const meta: { icon: IconName; text: string; strong?: boolean; testID: string }[] = [];
  if (model.application) meta.push({ icon: 'event', text: `${model.application.label} · ${model.application.stateLabel}`, strong: model.application.state === 'OPEN', testID: 'card-application' });
  if (model.location) meta.push({ icon: 'place', text: model.location.label, testID: 'card-location' });
  for (const place of model.nearby) meta.push({ icon: 'near-me', text: `${place.label} · ${place.distance}`, testID: 'card-nearby' });

  return (
    <View
      style={[styles.card, { flexBasis: d.cardBasis, padding: d.cardPadding, gap: d.cardGap }, highlighted && styles.cardHighlighted]}
      testID={testID}
    >
      <View style={styles.top}>
        {model.rank !== null ? (
          <View style={[styles.rank, compact && styles.rankCompact]}><Text style={[d.type.label, { color: k.colors.onPrimary }]}>{model.rank}</Text></View>
        ) : null}
        <View style={{ width: d.thumb, height: d.thumb, borderRadius: 12, overflow: 'hidden' }}>
          <ListingThumbSized media={model.media} housingType={model.housingType} district={model.district} size={d.thumb} />
        </View>
        <View style={styles.titleBox}>
          <Text style={[d.type.cardTitle, { color: k.colors.text }]} numberOfLines={2}>{model.title}</Text>
          {model.subtitle ? <Text style={[d.type.caption, { color: k.colors.textMuted }]} numberOfLines={1}>{model.subtitle}</Text> : null}
        </View>
        {favoriteSlot}
      </View>

      {/* 판정 상태가 카드에서 가장 먼저 읽히는 정보다. */}
      <View style={styles.badges}>
        <View style={[styles.status, { backgroundColor: tone.bg }]} testID="card-status">
          <MaterialIcons name={tone.icon} size={compact ? 16 : 20} color={tone.fg} />
          <Text style={[d.type.label, { color: tone.fg }]}>{model.status.label}</Text>
        </View>
        {model.stage ? (
          <View style={[styles.status, { backgroundColor: k.colors.lavender }]}>
            <MaterialIcons name="flag" size={compact ? 14 : 18} color={k.colors.primary} />
            <Text style={[d.type.label, { color: k.colors.primary }]} numberOfLines={1}>{model.stage}</Text>
          </View>
        ) : null}
      </View>

      {meta.length ? (
        <View style={styles.meta}>
          {meta.map(item => (
            <View key={`${item.icon}-${item.text}`} style={styles.metaRow} testID={item.testID}>
              <MaterialIcons name={item.icon} size={16} color={item.strong ? k.colors.primary : k.colors.textMuted} />
              <Text style={[d.type.caption, { color: item.strong ? k.colors.primary : k.colors.text, flex: 1 }]} numberOfLines={1}>{item.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {model.officialScore || model.recommendation ? (
        <View style={styles.scores}>
          {model.officialScore ? (
            // 공식 배점: 흰 바탕·테두리·의사봉 아이콘. 공고가 정한 점수 또는 그 상태.
            <View style={[styles.official, compact && styles.scoreCompact]} testID={model.officialScore.available ? 'official-score' : 'official-score-state'}>
              <View style={styles.scoreHead}>
                <MaterialIcons name="gavel" size={14} color={k.colors.textMuted} />
                <Text style={[d.type.caption, { color: k.colors.textMuted }]}>공식 배점</Text>
              </View>
              <Text style={[d.type.bodyStrong, { color: k.colors.text }]}>{model.officialScore.title}</Text>
            </View>
          ) : null}
          {model.recommendation ? (
            // 완판e 추천: 보라 바탕·반짝 아이콘·말로만. 점수가 아니다.
            <View style={[styles.wanpan, compact && styles.scoreCompact]} testID="wanpan-indicator" accessibilityLabel={`완판e 추천도 ${model.recommendation.label}. 공고 점수가 아니에요.`}>
              <View style={styles.scoreHead}>
                <MaterialIcons name="auto-awesome" size={14} color={k.colors.primary} />
                <Text style={[d.type.caption, { color: k.colors.primary }]}>완판e 추천도</Text>
              </View>
              <Text style={[d.type.bodyStrong, { color: k.colors.primary }]}>{model.recommendation.label}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {model.advantages.length ? <Lines title="유리한 조건" items={model.advantages} tone="good" /> : null}
      {model.cautions.length ? <Lines title={model.status.tone === 'difficult' ? '충족하지 못한 조건' : '확인할 조건'} items={model.cautions} tone="caution" /> : null}
      {model.note ? <Text style={[d.type.caption, { color: k.colors.textMuted }]}>{model.note}</Text> : null}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

function ListingThumbSized({ media, housingType, district, size }: { media: ListingCardModel['media']; housingType: string; district: string; size: number }) {
  // ListingThumb 는 72px 기준이라, 밀도별 크기에 맞춰 감싼 상자 안에서 꽉 채운다.
  return (
    <View style={{ width: size, height: size }}>
      {media ? <ListingThumb media={media} housingType={housingType} district={district} /> : <View style={styles.thumbEmpty}><MaterialIcons name="apartment" size={24} color={k.colors.textSubtle} /></View>}
    </View>
  );
}

function Lines({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'caution' }) {
  const { d } = useDensity();
  const good = tone === 'good';
  return (
    <View style={styles.lines}>
      <Text style={[d.type.label, { color: k.colors.textMuted }]}>{title}</Text>
      {items.map(item => (
        <View key={item} style={styles.lineRow}>
          <MaterialIcons name={good ? 'check' : 'priority-high'} size={16} color={good ? k.tint.green.fg : k.tint.amber.fg} />
          <Text style={[d.type.caption, { color: k.colors.text, flex: 1 }]} numberOfLines={2}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, backgroundColor: k.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: k.colors.outline },
  cardHighlighted: { borderColor: '#E7A64B', borderWidth: 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rank: { width: 36, height: 36, borderRadius: 10, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  rankCompact: { width: 28, height: 28, borderRadius: 8 },
  titleBox: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 30, borderRadius: 999, maxWidth: '100%' },
  meta: { gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scores: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  official: { flexGrow: 1, flexBasis: 120, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, padding: 12, gap: 2 },
  wanpan: { flexGrow: 1, flexBasis: 120, borderRadius: 12, backgroundColor: k.colors.lavender, padding: 12, gap: 2 },
  scoreCompact: { padding: 10 },
  scoreHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lines: { gap: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  thumbEmpty: { flex: 1, backgroundColor: k.colors.surfaceLow, alignItems: 'center', justifyContent: 'center' },
});
