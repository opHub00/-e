import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { AppearItem } from '../../components/motion/AppearItem';
import { colors, radius, size, spacing, tint, type } from '../../design/tokens';
import { RECRUITMENT_STATUS_LABEL } from '../discovery/domain';
import type { DiscoveryListing } from '../discovery/types';
import { countApprovedRules, sourceStatusLabel } from './analyzableListings';
import { INSIGHT_VIEW } from './domain';
import { listingRuleCache, useListingInsight } from './useListingInsight';
import type { AnalysisReadyState } from './useAnalysisReadyListings';

type Props = {
  /** 조회는 부모(useAnalysisReadyListings)가 한다. 이 컴포넌트는 받은 것만 그린다. */
  state: AnalysisReadyState;
  onOpen: (listingId: string) => void;
  onAnalyze: (listingId: string) => void;
};

/**
 * 완판e 분석 가능 공고.
 *
 * 일반 목록과 완전히 분리된 영역이다. 사용자가 고른 지역·추천 필터를 여기에 적용하지 않고,
 * 반대로 이 목록을 일반 목록에 섞지도 않는다. 판정까지 갈 수 있는 공고가 필터 때문에
 * 화면에서 사라지는 일을 막는 것이 이 섹션의 목적이다.
 *
 * 노출 기준은 announcement_listing_bindings 조회 결과 그대로다
 * (그 테이블이 보이는 것 자체가 활성·공개·승인된 rule set 과 binding 이 있다는 뜻이다).
 */
export function AnalyzableListingsSection({ state, onOpen, onAnalyze }: Props) {
  if (state.status === 'LOADING') {
    return (
      <View style={styles.wrap}>
        <Header />
        <View style={styles.card}><View style={styles.skeleton} /><View style={[styles.skeleton, styles.skeletonShort]} /></View>
      </View>
    );
  }
  const matched = state.listings;
  if (!matched.length) return null;

  return (
    <View style={styles.wrap}>
      <Header count={matched.length} />
      {matched.map((listing, index) => (
        <AppearItem key={listing.id} index={index}>
          <AnalyzableCard listing={listing} onOpen={() => onOpen(listing.id)} onAnalyze={() => onAnalyze(listing.id)} />
        </AppearItem>
      ))}
    </View>
  );
}

const Header = ({ count }: { count?: number }) => (
  <View style={styles.header}>
    <MaterialIcons name="verified" size={16} color={colors.primary} />
    <Text accessibilityRole="header" style={styles.headerText}>완판e 분석 가능 공고{count ? ` ${count}건` : ''}</Text>
  </View>
);

function AnalyzableCard({ listing, onOpen, onAnalyze }: { listing: DiscoveryListing; onOpen: () => void; onAnalyze: () => void }) {
  const state = useListingInsight(listing.id, true);
  const cached = listingRuleCache.peek(listing.id);
  const rules = cached?.status === 'AVAILABLE' ? cached.rules : undefined;
  const insight = state.phase === 'READY' ? state.insight : null;
  const status = listing.recruitmentStatus;
  return (
    <View style={styles.card}>
      <MotionPressable accessibilityRole="button" accessibilityLabel={`${listing.complexName} 상세 보기`} onPress={onOpen} style={styles.cardBody}>
        <View style={styles.row}>
          <View style={[styles.chip, { backgroundColor: status === 'open' ? tint.green.bg : status === 'upcoming' ? tint.amber.bg : colors.surfaceContainer }]}>
            <Text style={[styles.chipText, { color: status === 'open' ? tint.green.fg : status === 'upcoming' ? tint.amber.fg : colors.textSubtle }]}>
              {RECRUITMENT_STATUS_LABEL[status]}
            </Text>
          </View>
          <Text style={styles.place} numberOfLines={1}>{listing.region} · {listing.district}</Text>
        </View>

        <Text style={styles.name} numberOfLines={2}>{listing.complexName}</Text>

        <View style={styles.metaRow}>
          <MaterialIcons name="verified" size={13} color={tint.green.fg} />
          <Text style={styles.meta}>{sourceStatusLabel(rules?.sourceStatus)}</Text>
          {rules ? <Text style={styles.meta}>· 검수 완료 규칙 {countApprovedRules(rules)}개</Text> : null}
        </View>

        {/* 프로필이 있을 때만 현재 분석 상태를 말한다. 없으면 이 줄 자체가 없다. */}
        {insight ? (
          <View style={styles.metaRow}>
            <MaterialIcons name={INSIGHT_VIEW[insight.status].icon} size={13} color={tint[INSIGHT_VIEW[insight.status].tone].fg} />
            <Text style={[styles.insight, { color: tint[INSIGHT_VIEW[insight.status].tone].fg }]} numberOfLines={2}>{insight.label}</Text>
          </View>
        ) : null}
        {insight ? <Text style={styles.meta}>{insight.sentence}</Text> : null}
      </MotionPressable>

      <MotionPressable accessibilityRole="button" accessibilityLabel={`${listing.complexName} 내 조건으로 분석하기`} onPress={onAnalyze} style={styles.cta}>
        <MaterialIcons name="fact-check" size={15} color={colors.onPrimary} />
        <Text style={styles.ctaText}>내 조건으로 분석하기</Text>
      </MotionPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerText: { ...type.bodySmStrong, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.primary, padding: 12, gap: 8 },
  cardBody: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chip: { height: 20, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8 },
  chipText: { ...type.micro },
  place: { ...type.micro, color: colors.textSubtle, flexShrink: 1 },
  name: { ...type.cardTitle, color: colors.text, lineHeight: 23 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta: { ...type.micro, color: colors.textMuted },
  insight: { ...type.micro, flexShrink: 1 },
  cta: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.button, backgroundColor: colors.primary },
  ctaText: { ...type.bodySmStrong, color: colors.onPrimary },
  skeleton: { height: 14, borderRadius: radius.button, backgroundColor: colors.surfaceHigh },
  skeletonShort: { width: '60%' },
});
