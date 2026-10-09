import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import { bucketTone, k } from '../ui/theme';
import type { RecommendationSummaryV2, SummaryOutcomeItem } from './recommendationSummary';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * Recommendation Summary V2 화면. 섹션 순서가 곧 정보 우선순위다.
 * desktop(compact) 에서는 '가장 추천' 옆에 일정·확인할 점을 나란히 두어 한 화면에 더 많이 보이게 한다.
 */
export function RecommendationSummaryV2View({ summary, favoritesSlot, onOpen }: {
  summary: RecommendationSummaryV2;
  /** 관심 공고 영역을 바깥 component(예: 공고별 상세 요약)로 바꿀 때. */
  favoritesSlot?: ReactNode;
  onOpen?: (outcomeId: string) => void;
}) {
  const { d, density } = useDensity();
  const wide = density === 'compact';
  return (
    <View style={{ gap: d.sectionGap }} testID="summary-v2">
      <View style={[styles.split, wide && styles.splitWide, { gap: d.sectionGap }]}>
        <View style={[styles.col, wide && styles.colMain]}>
          <Section title="가장 추천하는 공고" icon="thumb-up" testID="summary-v2-top">
            {summary.top ? (
              <View style={[styles.top, { padding: d.cardPadding, gap: d.cardGap }]}>
                <ItemRow item={summary.top} onOpen={onOpen} emphasis />
                {summary.top.reasons.length ? (
                  <View style={styles.list}>
                    {summary.top.reasons.map(reason => <Bullet key={reason} icon="check" color={k.tint.green.fg} text={reason} />)}
                  </View>
                ) : null}
              </View>
            ) : <Empty text="지금 정보로 바로 신청할 수 있는 공고는 없어요. 함께 검토할 공고부터 살펴보세요." />}
          </Section>
          <Section title={`관심 공고 ${summary.favorites.length}개`} icon="star" testID="summary-v2-favorites">
            {favoritesSlot ?? (summary.favorites.length
              ? summary.favorites.map(item => <ItemRow key={item.outcomeId} item={item} onOpen={onOpen} />)
              : <Empty text="담은 관심 공고가 없어요. 결과 목록에서 별표를 눌러 담을 수 있어요." />)}
          </Section>
          {summary.alsoReview.length ? (
            <Section title="함께 검토할 공고" icon="playlist-add-check" testID="summary-v2-also">
              {summary.alsoReview.map(item => <ItemRow key={item.outcomeId} item={item} onOpen={onOpen} />)}
            </Section>
          ) : null}
        </View>
        <View style={[styles.col, wide && styles.colSide]}>
          {summary.schedule.length ? (
            <Section title="신청 일정" icon="event" testID="summary-v2-schedule">
              {summary.schedule.map(item => (
                <View key={item.listingId} style={styles.scheduleRow}>
                  <View style={[styles.dot, item.state === 'open' && styles.dotOpen]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[d.type.caption, { color: item.state === 'open' ? k.colors.primary : k.colors.textMuted }]}>{item.label}</Text>
                  </View>
                </View>
              ))}
            </Section>
          ) : null}
          {summary.why.length ? (
            <Section title="왜 추천하나요" icon="lightbulb-outline" testID="summary-v2-why">
              {summary.why.map(line => <Bullet key={line} icon="check-circle" color={k.tint.green.fg} text={line} />)}
            </Section>
          ) : null}
          <Section title="확인할 점" icon="error-outline" testID="summary-v2-cautions" tone="caution">
            {summary.cautions.length
              ? summary.cautions.map(line => <Bullet key={line} icon="priority-high" color={k.tint.amber.fg} text={line} />)
              : <Empty text="따로 확인할 점이 없어요." />}
            <Text style={[d.type.caption, { color: k.colors.textMuted }]}>입력한 정보로 계산한 예상 결과예요. 실제 자격은 모집공고와 증빙 서류로 확정돼요.</Text>
          </Section>
          <ProfileDisclosure profile={summary.profile} />
        </View>
      </View>
    </View>
  );
}

function Section({ title, icon, children, testID, tone }: { title: string; icon: IconName; children: ReactNode; testID?: string; tone?: 'caution' }) {
  const { d } = useDensity();
  return (
    <View style={[styles.section, tone === 'caution' && styles.sectionCaution, { padding: d.cardPadding, gap: d.cardGap }]} testID={testID}>
      <View style={styles.head}>
        <MaterialIcons name={icon} size={20} color={tone === 'caution' ? k.tint.amber.fg : k.colors.primary} />
        <Text style={[d.type.section, { color: k.colors.text }]} accessibilityRole="header">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ItemRow({ item, onOpen, emphasis }: { item: SummaryOutcomeItem; onOpen?: (id: string) => void; emphasis?: boolean }) {
  const { d } = useDensity();
  const tone = bucketTone[item.tone];
  const body = (
    <View style={styles.item}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[emphasis ? d.type.cardTitle : d.type.bodyStrong, { color: k.colors.text }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[d.type.caption, { color: k.colors.textMuted }]} numberOfLines={1}>{item.supply}{item.stage ? ` · ${item.stage}` : ''}</Text>
        {item.next && emphasis ? <Text style={[d.type.caption, { color: k.colors.text }]}>{item.next}</Text> : null}
      </View>
      <View style={[styles.status, { backgroundColor: tone.bg }]}>
        <MaterialIcons name={tone.icon} size={14} color={tone.fg} />
        <Text style={[d.type.label, { color: tone.fg }]}>{item.statusLabel}</Text>
      </View>
      {onOpen ? <MaterialIcons name="chevron-right" size={22} color={k.colors.textSubtle} /> : null}
    </View>
  );
  return onOpen ? (
    <MotionPressable accessibilityRole="button" accessibilityLabel={`${item.title} ${item.supply} 자세히 보기`} onPress={() => onOpen(item.outcomeId)} style={styles.itemHit}>
      {body}
    </MotionPressable>
  ) : body;
}

function Bullet({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  const { d } = useDensity();
  return (
    <View style={styles.bullet}>
      <MaterialIcons name={icon} size={16} color={color} />
      <Text style={[d.type.body, { color: k.colors.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { d } = useDensity();
  return <Text style={[d.type.body, { color: k.colors.textMuted }]}>{text}</Text>;
}

/** 내 입력 정보는 기본으로 접어 둔다. 결과가 주인공이다. */
function ProfileDisclosure({ profile }: { profile: RecommendationSummaryV2['profile'] }) {
  const { d } = useDensity();
  const [open, setOpen] = useState(false);
  if (!profile.household && !profile.lines.length) return null;
  return (
    <View style={[styles.profile, { padding: d.cardPadding, gap: d.cardGap }]} testID="summary-v2-profile">
      <MotionPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={open ? '내 입력 정보 접기' : '내 입력 정보 보기'}
        onPress={() => setOpen(value => !value)}
        style={styles.disclosure}
        testID="summary-v2-profile-toggle"
      >
        <MaterialIcons name="person-outline" size={20} color={k.colors.textMuted} />
        <Text style={[d.type.bodyStrong, { color: k.colors.textMuted, flex: 1 }]}>내 입력 정보{profile.household ? ` · ${profile.household}` : ''}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={k.colors.textMuted} />
      </MotionPressable>
      {open ? (
        <View style={styles.chips} testID="summary-v2-profile-details">
          {profile.lines.map(line => <Text key={line} style={[d.type.caption, styles.chip]}>{line}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { gap: 20 },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { gap: 16 },
  colMain: { flex: 3 },
  colSide: { flex: 2 },
  section: { backgroundColor: k.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: k.colors.outline },
  sectionCaution: { backgroundColor: k.tint.amber.bg, borderColor: k.tint.amber.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  top: { borderRadius: 14, backgroundColor: k.tint.green.bg },
  list: { gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemHit: { minHeight: 44, justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 28, borderRadius: 999 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: k.colors.outline },
  dotOpen: { backgroundColor: k.colors.primary },
  profile: { borderRadius: 18, backgroundColor: k.colors.surfaceLow },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { color: k.colors.text, backgroundColor: k.colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
});
