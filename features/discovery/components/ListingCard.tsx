import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { Pop } from '../../../components/motion/Pop';
import { colors, radius, tint, tracking, type } from '../../../design/tokens';
import { selectListingVisual } from '../../listingVisual/selectListingVisual';
import {
  formatHouseholdCount,
  formatPrice,
  formatRecruitmentSchedule,
  hasListingPrice,
  RECRUITMENT_STATUS_LABEL,
} from '../domain';
import type { DiscoveryListing, ListingRelevance } from '../types';
import { INSIGHT_VIEW, type ListingInsight } from '../../listingInsight/domain';
import { ListingVisualFrame } from './ListingVisualFrame';

type Props = {
  listing: DiscoveryListing;
  relevance: ListingRelevance;
  saved: boolean;
  onToggleSaved: () => void;
  onOpen: () => void;
  /** 판정 규칙이 연결된 공고에서만 들어온다. 없으면 기존 표시를 그대로 둔다. */
  insight?: ListingInsight | null;
  /** 마감까지 남은 기간. 날짜를 모르면 null 이라 아무것도 그리지 않는다. */
  deadline?: string | null;
  /** 부족한 정보를 채우러 갈 곳. insight 가 있을 때만 쓴다. */
  onStartAssessment?: () => void;
};

const STATUS_STYLE: Record<
  DiscoveryListing['recruitmentStatus'],
  { bg: string; fg: string }
> = {
  open: { bg: tint.green.bg, fg: tint.green.fg },
  upcoming: { bg: tint.amber.bg, fg: tint.amber.fg },
  closed: { bg: colors.surfaceContainer, fg: colors.textSubtle },
  unknown: { bg: colors.surfaceContainer, fg: colors.textSubtle },
};

/** 목록은 훑는 화면이다. 세로를 늘리지 않도록 왼쪽에 고정 폭 한 칸만 둔다. */
const THUMB = 96;

/**
 * 실제 공고는 가격이 없는 경우가 많다.
 * 값이 없는 필드는 자리표시자 없이 통째로 빼고 있는 정보만 촘촘히 보여준다.
 *
 * 주택 유형은 왼쪽 칸의 아이콘이 대신하므로 사실 목록에서는 뺀다.
 * 같은 정보를 두 번 쓰면 좁은 오른쪽 칸이 금방 찬다.
 */
export function ListingCard({ listing, relevance, saved, onToggleSaved, onOpen, insight, deadline, onStartAssessment }: Props) {
  const status = STATUS_STYLE[listing.recruitmentStatus];
  const schedule = formatRecruitmentSchedule(listing);
  const facts = [
    schedule || null,
    listing.householdCount !== null ? formatHouseholdCount(listing.householdCount) : null,
    hasListingPrice(listing) ? formatPrice(listing.representativePrice) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <View style={styles.wrapper}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`${listing.complexName} 상세 보기`}
        onPress={onOpen}
        style={styles.row}
      >
        <ListingVisualFrame
          visual={selectListingVisual(listing)}
          housingType={listing.housingType}
          variant="thumbnail"
          placeLabel={listing.district}
          style={styles.thumb}
        />

        <View style={styles.body}>
          <View style={styles.top}>
            <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.fg }]}>
                {RECRUITMENT_STATUS_LABEL[listing.recruitmentStatus]}
              </Text>
            </View>
            {/* 자치구는 왼쪽 칸이 들고 있다. 같은 자리에서 두 번 읽히지 않게 시도만 남긴다. */}
            <Text style={styles.place} numberOfLines={1}>
              {listing.region}
            </Text>
            {/* 마감은 공고 데이터만으로 계산한다. 날짜가 없으면 아예 그리지 않는다. */}
            {deadline ? (
              <View style={[styles.statusChip, { backgroundColor: tint.amber.bg }]}>
                <Text style={[styles.statusText, { color: tint.amber.fg }]}>{deadline}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.name} numberOfLines={2}>
            {listing.complexName}
          </Text>

          {facts.length > 0 ? (
            <View style={styles.facts}>
              {facts.map((fact, index) => (
                <View key={fact} style={styles.factItem}>
                  {index > 0 ? <View style={styles.factDot} /> : null}
                  <Text style={styles.factText}>{fact}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* 판정 결과가 있으면 그것이 우선이다. 없으면 기존 관심도 표시를 그대로 둔다. */}
          {insight ? (
            <View style={styles.insight}>
              <View style={styles.insightRow}>
                <MaterialIcons name={INSIGHT_VIEW[insight.status].icon} size={13} color={tint[INSIGHT_VIEW[insight.status].tone].fg} />
                <Text style={[styles.insightText, { color: tint[INSIGHT_VIEW[insight.status].tone].fg }]} numberOfLines={2}>
                  {insight.label}
                </Text>
              </View>
              <Text style={styles.insightDetail} numberOfLines={1}>{insight.sentence}</Text>
              {insight.sourceStatus === 'OFFICIAL_VERIFIED' ? (
                <View style={styles.insightRow}>
                  <MaterialIcons name="verified" size={12} color={tint.green.fg} />
                  <Text style={[styles.insightDetail, { color: tint.green.fg }]}>공식 공고 기준으로 판정했어요</Text>
                </View>
              ) : null}
              {insight.answerableMissing > 0 && onStartAssessment ? (
                <MotionPressable accessibilityRole="button" accessibilityLabel={`${listing.complexName} 추가 정보 입력하기`} onPress={onStartAssessment} style={styles.cta}>
                  <Text style={styles.ctaText}>정보 {insight.answerableMissing}개 입력하고 분석하기</Text>
                </MotionPressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.relevance}>
              <MaterialIcons name="auto-awesome" size={13} color={colors.primary} />
              <Text style={styles.relevanceText}>{relevance.label}</Text>
            </View>
          )}
        </View>
      </MotionPressable>

      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={saved ? '저장 취소' : '청약 저장'}
        onPress={onToggleSaved}
        hitSlop={10}
        // 켜지는 순간은 Pop 이 맡는다. 눌림 scale 까지 겹치면 두 번 튄다.
        pressedScale={1}
        style={styles.saveButton}
      >
        <Pop active={saved}>
          <MaterialIcons
            name={saved ? 'favorite' : 'favorite-border'}
            size={19}
            color={saved ? colors.primary : colors.outline}
          />
        </Pop>
      </MotionPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    paddingLeft: 12,
    paddingRight: 46,
    paddingVertical: 12,
  },
  /** 고정 크기라 이미지가 오든 안 오든 카드 높이가 같다. */
  thumb: { width: THUMB, height: THUMB },
  body: { flex: 1, minWidth: 0, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusChip: {
    height: 20,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
  },
  statusText: { ...type.micro },
  place: { ...type.micro, color: colors.textSubtle, flexShrink: 1 },
  saveButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },

  name: { ...type.cardTitle, color: colors.text, letterSpacing: tracking.snug, lineHeight: 23 },

  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  factItem: { flexDirection: 'row', alignItems: 'center' },
  factDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.outline,
    marginHorizontal: 7,
  },
  factText: { ...type.caption, color: colors.textMuted },

  relevance: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  relevanceText: { ...type.micro, color: colors.primary },

  insight: { gap: 3, marginTop: 1 },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  insightText: { ...type.micro, flexShrink: 1 },
  insightDetail: { ...type.micro, color: colors.textMuted },
  cta: { marginTop: 2, alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.lavender, paddingHorizontal: 10, paddingVertical: 5 },
  ctaText: { ...type.micro, color: colors.primary },
});
