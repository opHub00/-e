import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import { bucketTone, k } from '../ui/theme';
import { ELIGIBILITY_TEXT, formatDistrictDate, formatMonthly, formatPriceTiers } from './districtAdapter';
import type { DistrictCardModel, DistrictComparisonModel } from './districtContract';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/**
 * 1·2지구 비교 영역. 화면 순서: 내 신청 가능한 선택지(두 카드) → 두 지구 비교 → 신청 일정 → 비용 비교.
 * 지구끼리 순위를 매기지 않는다. 공급 세대수·가격은 정보이며 당첨 가능성을 뜻하지 않는다.
 * 값은 최종1.8 공고 config와 dual assessment에서만 읽으며 화면에서 숫자를 만들지 않는다.
 */
const TONE = {
  eligible: { bg: bucketTone.eligible.bg, fg: bucketTone.eligible.fg },
  review: { bg: bucketTone.review.bg, fg: bucketTone.review.fg },
  difficult: { bg: bucketTone.difficult.bg, fg: bucketTone.difficult.fg },
  pending: { bg: k.colors.surfaceContainer, fg: k.colors.textMuted },
} as const;

function statusOf(card: DistrictCardModel): { label: string; tone: keyof typeof TONE } {
  if (card.assessment.status === 'PENDING') return { label: '판정 연결 전', tone: 'pending' };
  return ELIGIBILITY_TEXT[card.assessment.eligibility];
}

function scoreOf(card: DistrictCardModel): string | null {
  if (card.assessment.status !== 'READY') return null;
  const score = card.assessment.officialScore;
  if (score.status === 'AVAILABLE') return `공식 가점 ${score.total}/${score.max}점`;
  return score.status === 'NOT_APPLICABLE' ? '공식 점수 해당 없음' : '공식 가점 계산 전';
}

/** 면적별 두 값: 한 칸에 '/'로 붙이지 않고 '49㎡ …' · '59㎡ …' 두 줄로. 둘 다 없으면 null. */
const pair = (a: string | null, b: string | null) => (a || b ? `49㎡ ${a ?? '—'}\n59㎡ ${b ?? '—'}` : null);

function Section({ testID, icon, title, hint, children }: { testID: string; icon: IconName; title: string; hint?: string; children: ReactNode }) {
  const { d } = useDensity();
  return (
    <View testID={testID} style={[styles.card, { padding: d.cardPadding, gap: d.cardGap }]}>
      <View style={{ gap: 2 }}>
        <View style={styles.titleRow}>
          <MaterialIcons name={icon} size={d.type.section.fontSize} color={k.colors.primary} />
          <Text accessibilityRole="header" style={[d.type.section, styles.text]}>{title}</Text>
        </View>
        {hint ? <Text style={[d.type.caption, styles.muted]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const { d } = useDensity();
  return (
    <View style={styles.fact}>
      <Text style={[d.type.caption, styles.muted]}>{label}</Text>
      <Text style={[value ? d.type.bodyStrong : d.type.caption, value ? styles.text : styles.subtle]}>{value ?? '확인 필요'}</Text>
    </View>
  );
}

function DistrictCard({ card }: { card: DistrictCardModel }) {
  const { density, d } = useDensity();
  const touch = density === 'touch';
  // 사용자가 누르기 전에는 화면 폭으로 정한다(휴대폰은 접힘). 붙기 전 정적 화면 폭에 묶이지 않게.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? !touch;
  const status = statusOf(card);
  const tone = TONE[status.tone];
  const ready = card.assessment.status === 'READY' ? card.assessment : null;
  const inv = card.inventory;
  return (
    <View testID={`district-card-${card.id}`} style={[styles.districtCard, { padding: d.cardPadding - 2, gap: d.cardGap - 2, borderTopColor: card.id === 'D1' ? k.colors.primary : k.colors.success }]}>
      <View style={styles.cardHead}>
        <View style={[styles.districtPill, { backgroundColor: card.id === 'D1' ? k.colors.primary : k.colors.success }]}>
          <Text style={[d.type.label, { color: k.colors.onPrimary }]}>{card.label}</Text>
        </View>
        <Text style={[d.type.cardTitle, styles.text, styles.flex]} numberOfLines={1}>{card.title}</Text>
      </View>
      <View style={[styles.recommend, { padding: d.cardGap - 2 }]}>
        <Text style={[d.type.caption, styles.muted]}>추천 공급유형</Text>
        <Text testID={`district-${card.id}-supply`} style={[d.type.section, ready?.recommendedSupply ? styles.text : styles.subtle]}>
          {ready ? ready.recommendedSupply ?? '신청 가능한 유형 없음' : card.assessment.status === 'PENDING' ? '판정 연결 전' : ''}
        </Text>
        <View style={styles.chips}>
          <View testID={`district-${card.id}-status`} style={[styles.chip, { backgroundColor: tone.bg }]}><Text style={[d.type.label, { color: tone.fg }]}>{status.label}</Text></View>
          {ready?.priorityStage ? <View style={styles.chip}><Text style={[d.type.label, styles.text]}>{ready.priorityStage}</Text></View> : null}
          {scoreOf(card) ? <View style={styles.chip}><Text style={[d.type.label, styles.text]}>{scoreOf(card)}</Text></View> : null}
        </View>
        {card.assessment.status === 'PENDING' ? <Text style={[d.type.caption, styles.muted]}>{card.assessment.reason}</Text> : null}
      </View>
      <View style={styles.factGrid}>
        <Fact label="추천 유형 공급" value={ready?.supplyCount ? `${ready.supplyCount}세대` : null} />
        <Fact label="총 공급" value={inv ? `${inv.total}세대` : null} />
        <Fact label="49㎡ / 59㎡" value={inv ? `${inv.units49} / ${inv.units59}세대` : null} />
        <Fact label="특별공급 접수" value={formatDistrictDate(card.schedule.special)} />
      </View>
      {touch ? (
        <MotionPressable
          testID={`district-${card.id}-more`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${card.label} 가격·일정 ${open ? '접기' : '펼치기'}`}
          onPress={() => setChoice(!open)}
          style={styles.moreButton}
        >
          <Text style={[d.type.label, styles.primary]}>{open ? '가격·일정 접기' : '가격·일정 자세히'}</Text>
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={k.colors.primary} />
        </MotionPressable>
      ) : null}
      {open ? (
        <View testID={`district-${card.id}-details`} style={styles.factGrid}>
          <Fact label="분양가 49㎡" value={formatPriceTiers(card.costs.salePrices49)} />
          <Fact label="분양가 59㎡" value={formatPriceTiers(card.costs.salePrices59)} />
          <Fact label="월 토지임대료 49㎡" value={formatMonthly(card.costs.monthlyLandRent49)} />
          <Fact label="월 토지임대료 59㎡" value={formatMonthly(card.costs.monthlyLandRent59)} />
          <Fact label="당첨자 발표" value={formatDistrictDate(card.schedule.winnerAnnouncement)} />
          <Fact label="근거" value={card.source.label} />
        </View>
      ) : null}
    </View>
  );
}

/** 한 줄 = 비교 항목 하나, 칸 = 1지구 · 2지구. 휴대폰에서도 두 칸을 나란히 둔다(좁으면 줄바꿈). */
function CompareTable({ testID, rows, cards }: { testID: string; rows: { label: string; values: (string | null)[] }[]; cards: DistrictCardModel[] }) {
  const { density, d } = useDensity();
  const touch = density === 'touch';
  return (
    <View testID={testID} style={styles.table}>
      <View style={[styles.tr, styles.thead]}>
        {touch ? null : <Text style={[d.type.label, styles.muted, styles.thLabel]}>항목</Text>}
        {cards.map(card => <Text key={card.id} style={[d.type.label, styles.text, styles.td]}>{card.label}</Text>)}
      </View>
      {rows.map(row => (
        <View key={row.label} style={[styles.tr, touch && styles.trTouch]}>
          <Text style={[d.type.label, styles.muted, touch ? styles.thTouch : styles.thLabel]}>{row.label}</Text>
          <View style={[styles.tdGroup, touch && styles.tdGroupTouch]}>
            {row.values.map((value, index) => (
              <Text key={index} style={[value ? d.type.body : d.type.caption, value ? styles.text : styles.subtle, styles.td]}>{value ?? '확인 필요'}</Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function DistrictComparison({ model }: { model: DistrictComparisonModel }) {
  const { density, d } = useDensity();
  const cards = model.cards;
  const side = density !== 'touch';
  const readyOr = (card: DistrictCardModel, fn: (ready: Extract<DistrictCardModel['assessment'], { status: 'READY' }>) => string | null) =>
    card.assessment.status === 'READY' ? fn(card.assessment) : null;
  return (
    <View testID="district-comparison" style={{ gap: d.sectionGap }}>
      {model.sample ? (
        <View testID="district-sample-banner" style={styles.sample}>
          <MaterialIcons name="warning-amber" size={20} color={k.colors.warning} />
          <Text style={[d.type.bodyStrong, { color: k.colors.warning }]}>레이아웃 점검용 예시 값이 섞여 있어요 · 실제 공고 값이 아니에요</Text>
        </View>
      ) : null}
      <Section testID="district-choices" icon="fact-check" title="내 신청 가능한 선택지" hint="한 번 입력한 정보로 두 지구를 각각 확인했어요. 지구 사이 순위는 매기지 않아요.">
        <View style={[styles.cards, side && styles.cardsSide, { gap: d.gridGap }]}>
          {cards.map(card => <View key={card.id} style={side ? styles.flex : null}><DistrictCard card={card} /></View>)}
        </View>
      </Section>
      <Section testID="district-compare" icon="compare-arrows" title="두 지구 비교" hint="공급 세대수와 가격은 공고 정보이며 당첨 가능성을 뜻하지 않아요.">
        <CompareTable
          testID="district-compare-table"
          cards={cards}
          rows={[
            { label: '신청 가능 여부', values: cards.map(card => statusOf(card).label === '판정 연결 전' ? null : statusOf(card).label) },
            { label: '우선단계', values: cards.map(card => readyOr(card, ready => ready.priorityStage)) },
            { label: '공급세대', values: cards.map(card => readyOr(card, ready => (ready.supplyCount ? `추천 유형 ${ready.supplyCount}세대` : null)) ?? (card.inventory ? `총 ${card.inventory.total}세대` : null)) },
            { label: '분양가격', values: cards.map(card => pair(formatPriceTiers(card.costs.salePrices49), formatPriceTiers(card.costs.salePrices59))) },
            { label: '월 토지임대료', values: cards.map(card => pair(formatMonthly(card.costs.monthlyLandRent49), formatMonthly(card.costs.monthlyLandRent59))) },
            { label: '일정', values: cards.map(card => (card.schedule.special ? `특별공급 ${formatDistrictDate(card.schedule.special)}` : null)) },
          ]}
        />
      </Section>
      <View style={[styles.cards, side && styles.cardsSide, { gap: d.sectionGap }]}>
        <View style={side ? styles.flex : null}>
          <Section testID="district-schedule" icon="event-available" title="신청 일정">
            <CompareTable
              testID="district-schedule-table"
              cards={cards}
              rows={[
                { label: '특별공급', values: cards.map(card => formatDistrictDate(card.schedule.special)) },
                { label: '일반 1순위', values: cards.map(card => formatDistrictDate(card.schedule.generalFirst)) },
                { label: '일반 2순위', values: cards.map(card => formatDistrictDate(card.schedule.generalSecond)) },
                { label: '당첨자 발표', values: cards.map(card => formatDistrictDate(card.schedule.winnerAnnouncement)) },
              ]}
            />
          </Section>
        </View>
        <View style={side ? styles.flex : null}>
          <Section testID="district-costs" icon="payments" title="비용 비교" hint="공고 기준 금액이에요. 계약 조건은 공고문으로 확인해요.">
            <CompareTable
              testID="district-costs-table"
              cards={cards}
              rows={[
                { label: '49㎡ 분양가', values: cards.map(card => formatPriceTiers(card.costs.salePrices49)) },
                { label: '59㎡ 분양가', values: cards.map(card => formatPriceTiers(card.costs.salePrices59)) },
                { label: '월 토지임대료 49㎡', values: cards.map(card => formatMonthly(card.costs.monthlyLandRent49)) },
                { label: '월 토지임대료 59㎡', values: cards.map(card => formatMonthly(card.costs.monthlyLandRent59)) },
              ]}
            />
          </Section>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: k.colors.text },
  muted: { color: k.colors.textMuted },
  subtle: { color: k.colors.textSubtle },
  primary: { color: k.colors.primary },
  flex: { flex: 1, minWidth: 0 },
  card: { backgroundColor: k.colors.surface, borderRadius: k.radius.lg, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cards: { gap: 12 },
  cardsSide: { flexDirection: 'row', alignItems: 'stretch' },
  districtCard: { borderRadius: k.radius.md, borderWidth: 1, borderColor: k.colors.surfaceHigh, borderTopWidth: 4, backgroundColor: k.colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  districtPill: { borderRadius: k.radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  recommend: { backgroundColor: k.colors.surfaceLow, borderRadius: k.radius.md, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: k.radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: k.colors.surfaceContainer },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 8 },
  fact: { flexGrow: 1, flexBasis: 130, minWidth: 0, gap: 1 },
  moreButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: k.radius.md, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  table: { borderRadius: k.radius.md, borderWidth: 1, borderColor: k.colors.surfaceHigh, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  trTouch: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  thead: { backgroundColor: k.colors.surfaceLow, borderTopWidth: 0 },
  thLabel: { width: 112 },
  thTouch: { width: '100%' as unknown as number },
  tdGroup: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 8 },
  tdGroupTouch: { flex: 0 },
  td: { flex: 1, minWidth: 0 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: k.radius.md, backgroundColor: k.tint.amber.bg, borderWidth: 1, borderColor: k.colors.warning },
});
