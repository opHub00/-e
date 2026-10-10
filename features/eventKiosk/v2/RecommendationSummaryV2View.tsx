import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import type { RecommendationItem, RecommendationPortfolio } from '../live/recommendation';
import { useDensity } from '../layout/DensityContext';
import { HOUSEHOLD_TYPES, type KioskAnswers } from '../model';
import { kioskStatusLabel } from '../presentation';
import { bucketTone, k } from '../ui/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
type Profile = { household: string | null; lines: string[] };

/** Uses recommendation.ts as the only ranking/status source; this component only groups rows for display. */
export function RecommendationSummaryV2View({ portfolio, answers, favoritesSlot, onOpen }: {
  portfolio: RecommendationPortfolio;
  answers: KioskAnswers | null;
  favoritesSlot?: ReactNode;
  onOpen?: (outcomeId: string) => void;
}) {
  const { d, density } = useDensity();
  const wide = density === 'compact';
  const view = useMemo(() => portfolioView(portfolio, answers), [answers, portfolio]);
  return (
    <View style={{ gap: d.sectionGap }} testID="summary-v2">
      <View style={[styles.collection, wide && styles.collectionWide, { gap: d.sectionGap }]}>
        <View style={styles.collectionColumn}>
          <Section title="나에게 가장 맞는 공고" icon="thumb-up" testID="summary-v2-top" emphasis>
            {view.top ? <><ItemRow item={view.top} onOpen={onOpen} emphasis />{view.top.whyMatched.length ? <View style={styles.list}>{view.top.whyMatched.map(reason => <Bullet key={reason} icon="check" color={k.tint.green.fg} text={reason} />)}</View> : null}</> : <Empty text="지금 정보로 바로 신청할 수 있는 공고는 없어요. 함께 검토할 공고부터 살펴보세요." />}
          </Section>
        </View>
        <View style={styles.collectionColumn}>
          <Section title={`관심 공고 ${view.favorites.length}개`} icon="star" testID="summary-v2-favorites">
            {favoritesSlot ?? (view.favorites.length ? view.favorites.map(item => <View key={item.id} testID="summary-selected-item"><ItemRow item={item} onOpen={onOpen} /></View>) : <Empty text="담은 관심 공고가 없어요. 결과 목록에서 별표를 눌러 담을 수 있어요." />)}
          </Section>
        </View>
        <View style={styles.collectionColumn}>
          <Section title="함께 검토할 공고" icon="playlist-add-check" testID="summary-v2-also">
            {view.alsoReview.length ? view.alsoReview.map(item => <ItemRow key={item.id} item={item} onOpen={onOpen} />) : <Empty text="추가로 검토할 공고가 없어요." />}
          </Section>
        </View>
      </View>
      <View style={[styles.support, wide && styles.supportWide, { gap: d.sectionGap }]}>
        <View style={styles.supportColumn}>
          <Section title="신청 일정 · 다시 확인할 날짜" icon="event" testID="summary-v2-schedule">
            {view.schedule.length ? view.schedule.map(item => (
              <View key={item.listing.canonicalKey} style={styles.scheduleRow}>
                <View style={[styles.dot, item.applicationDates.status === 'OPEN' && styles.dotOpen]} />
                <View style={{ flex: 1 }}><Text style={[d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={1}>{item.listing.title}</Text><Text style={[d.type.caption, { color: item.applicationDates.status === 'OPEN' ? k.colors.primary : k.colors.textMuted }]}>{applicationLabel(item)}</Text></View>
              </View>
            )) : <Empty text="확정된 신청 일정이 없어요." />}
          </Section>
        </View>
        <View style={styles.supportColumn}>
          <Section title="추가 확인사항 · 주변환경" icon="lightbulb-outline" testID="summary-v2-why">
            {view.why.length ? view.why.map(line => <Bullet key={line} icon="check-circle" color={k.tint.green.fg} text={line} />) : <Empty text="표시할 추천 근거가 없어요." />}
          </Section>
          <Section title="확인할 점" icon="error-outline" testID="summary-v2-cautions" tone="caution">
            {view.cautions.length ? view.cautions.map(line => <Bullet key={line} icon="priority-high" color={k.tint.amber.fg} text={line} />) : <Empty text="따로 확인할 점이 없어요." />}
            <Text style={[d.type.caption, { color: k.colors.textMuted }]}>입력한 정보로 계산한 예상 결과예요. 실제 자격은 모집공고와 증빙 서류로 확정돼요.</Text>
          </Section>
        </View>
      </View>
      <ProfileDisclosure profile={view.profile} />
    </View>
  );
}

function portfolioView(portfolio: RecommendationPortfolio, answers: KioskAnswers | null) {
  const top = portfolio.items.find(item => item.assessmentStatus === 'COMPLETE') ?? null;
  const favorites = portfolio.items.filter(item => item.favorite);
  const taken = new Set([top?.id, ...favorites.map(item => item.id)]);
  const alsoReview = portfolio.items.filter(item => !taken.has(item.id) && item.assessmentStatus !== 'INELIGIBLE' && item.assessmentStatus !== 'UNAVAILABLE').slice(0, 3);
  const focus = [top, ...favorites, ...alsoReview].filter((item): item is RecommendationItem => Boolean(item));
  const schedule = uniqueListings(focus).sort((a, b) => scheduleOrder(a) - scheduleOrder(b) || (a.applicationDates.start ?? '9999').localeCompare(b.applicationDates.start ?? '9999'));
  return {
    top,
    favorites,
    alsoReview,
    schedule,
    why: top?.whyMatched.slice(0, 4) ?? [],
    cautions: [...new Set(focus.flatMap(item => item.cautions))].slice(0, 5),
    profile: profileOf(answers),
  };
}

function uniqueListings(items: RecommendationItem[]): RecommendationItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.listing.canonicalKey)) return false;
    seen.add(item.listing.canonicalKey);
    return true;
  });
}
const scheduleOrder = (item: RecommendationItem) => ({ OPEN: 0, UPCOMING: 1, UNKNOWN: 2, CLOSED: 3 })[item.applicationDates.status];
const dot = (date: string | null) => date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5).replace('-', '.') : null;
function applicationLabel(item: RecommendationItem): string {
  const from = dot(item.applicationDates.start);
  const to = dot(item.applicationDates.end);
  const state = ({ OPEN: '접수 중', UPCOMING: '접수 예정', CLOSED: '접수 마감', UNKNOWN: '일정 확인 필요' })[item.applicationDates.status];
  return from || to ? `${from ?? '미정'} ~ ${to ?? '미정'} · ${state}` : state;
}

function profileOf(answers: KioskAnswers | null): Profile {
  if (!answers) return { household: null, lines: [] };
  const yesNo = (value: boolean | null, yes: string, no: string) => value === null ? null : value ? yes : no;
  return {
    household: HOUSEHOLD_TYPES.find(type => type.key === answers.householdType)?.label ?? null,
    lines: [
      yesNo(answers.applicant.livesInEventRegion, '행사 지역 거주', '행사 지역 외 거주'),
      yesNo(answers.applicant.householdNoHome, '세대 무주택', '세대 주택 보유'),
      answers.subscription.accountKind === 'housing' ? '주택청약종합저축 보유' : answers.subscription.accountKind === 'none' ? '청약통장 없음' : null,
      answers.household.childrenCount ? `자녀 ${answers.household.childrenCount}명` : null,
    ].filter((line): line is string => Boolean(line)),
  };
}

function Section({ title, icon, children, testID, tone, emphasis }: { title: string; icon: IconName; children: ReactNode; testID?: string; tone?: 'caution'; emphasis?: boolean }) {
  const { d } = useDensity();
  return <View style={[styles.section, tone === 'caution' && styles.sectionCaution, emphasis && styles.sectionEmphasis, { padding: d.cardPadding, gap: d.cardGap }]} testID={testID}><View style={styles.head}><MaterialIcons name={icon} size={20} color={tone === 'caution' ? k.tint.amber.fg : k.colors.primary} /><Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">{title}</Text></View>{children}</View>;
}

function ItemRow({ item, onOpen, emphasis }: { item: RecommendationItem; onOpen?: (id: string) => void; emphasis?: boolean }) {
  const { d } = useDensity();
  const toneKey = item.assessmentStatus === 'COMPLETE' ? 'eligible' : item.assessmentStatus === 'INELIGIBLE' ? 'difficult' : 'review';
  const tone = bucketTone[toneKey];
  const statusLabel = item.assessmentStatus === 'INFORMATION_ONLY' ? '공고 정보만 제공' : kioskStatusLabel(item.assessmentStatus);
  const canOpen = Boolean(onOpen && item.assessmentStatus !== 'INFORMATION_ONLY');
  const body = <View style={styles.item}><View style={{ flex: 1, gap: 2 }}><Text style={[emphasis ? d.type.cardTitle : d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={2}>{item.listing.title}</Text><Text style={[d.type.caption, { color: k.colors.textMuted }]} numberOfLines={1}>{item.supplyType}{item.priority.label ? ` · ${item.priority.label}` : ''}</Text>{item.cautions[0] && emphasis ? <Text style={[d.type.caption, { color: k.colors.text }]}>{item.cautions[0]}</Text> : null}</View><View style={[styles.status, { backgroundColor: tone.bg }]}><MaterialIcons name={tone.icon} size={14} color={tone.fg} /><Text style={[d.type.label, { color: tone.fg }]}>{statusLabel}</Text></View>{canOpen ? <MaterialIcons name="chevron-right" size={22} color={k.colors.textSubtle} /> : null}</View>;
  return canOpen ? <MotionPressable accessibilityRole="button" accessibilityLabel={`${item.listing.title} ${item.supplyType} 자세히 보기`} onPress={() => onOpen?.(item.id)} style={styles.itemHit}>{body}</MotionPressable> : body;
}
function Bullet({ icon, color, text }: { icon: IconName; color: string; text: string }) { const { d } = useDensity(); return <View style={styles.bullet}><MaterialIcons name={icon} size={16} color={color} /><Text style={[d.type.body, { color: k.colors.text, flex: 1 }]}>{text}</Text></View>; }
function Empty({ text }: { text: string }) { const { d } = useDensity(); return <Text style={[d.type.body, { color: k.colors.textMuted }]}>{text}</Text>; }
function ProfileDisclosure({ profile }: { profile: Profile }) {
  const { d } = useDensity();
  const [open, setOpen] = useState(false);
  if (!profile.household && !profile.lines.length) return null;
  return <View style={[styles.profile, { padding: d.cardPadding, gap: d.cardGap }]} testID="summary-v2-profile"><MotionPressable accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} accessibilityLabel={open ? '내 입력 정보 접기' : '내 입력 정보 보기'} onPress={() => setOpen(value => !value)} style={styles.disclosure} testID="summary-v2-profile-toggle"><MaterialIcons name="person-outline" size={20} color={k.colors.textMuted} /><Text style={[d.type.bodyStrong, { color: k.colors.textMuted, flex: 1 }]}>내 입력 정보{profile.household ? ` · ${profile.household}` : ''}</Text><MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={k.colors.textMuted} /></MotionPressable>{open ? <View style={styles.chips} testID="summary-v2-profile-details">{profile.lines.map(line => <Text key={line} style={[d.type.caption, styles.chip]}>{line}</Text>)}</View> : null}</View>;
}

const styles = StyleSheet.create({
  collection: { gap: 20 }, collectionWide: { flexDirection: 'row', alignItems: 'flex-start' }, collectionColumn: { flex: 1, minWidth: 0 }, support: { gap: 20 }, supportWide: { flexDirection: 'row', alignItems: 'flex-start' }, supportColumn: { flex: 1, minWidth: 0, gap: 16 }, section: { backgroundColor: k.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: k.colors.outline }, sectionEmphasis: { backgroundColor: k.colors.lavender }, sectionCaution: { backgroundColor: k.tint.amber.bg, borderColor: k.tint.amber.bg }, head: { flexDirection: 'row', alignItems: 'center', gap: 8 }, list: { gap: 6 }, item: { flexDirection: 'row', alignItems: 'center', gap: 10 }, itemHit: { minHeight: 44, justifyContent: 'center' }, status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 28, borderRadius: 6 }, bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: k.colors.outline }, dotOpen: { backgroundColor: k.colors.primary }, profile: { borderRadius: 10, backgroundColor: k.colors.surfaceLow }, disclosure: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { color: k.colors.text, backgroundColor: k.colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
});
