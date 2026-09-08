import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear } from '../../components/motion/Appear';
import { useCountUp } from '../../hooks/useCountUp';
import { BrandMark } from '../../components/BrandMark';
import { Disclaimer } from '../../components/Disclaimer';
import { stagger, travel } from '../../design/motion';
import { colors, numeric, overlay, radius, size, spacing, tint, tracking, type } from '../../design/tokens';
import {
  calculatePreparationScore,
  getRecommendedActions,
  getStage,
  MILESTONE_MONTHS,
  simulateFuture,
} from '../../domain/preparation';
import { getLevel, XP_PER_QUIZ } from '../../domain/quiz';
import {
  formatPrice,
  getListingRelevance,
  hasListingPrice,
  RECRUITMENT_STATUS_LABEL,
} from '../../features/discovery/domain';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';
import { getHomeRecommendations, resolveSavedListings } from '../../features/discovery/homeListings';
import { useDiscoveryStore } from '../../features/discovery/useDiscoveryStore';
import { calculateProfileCompleteness, toDiscoveryUserProfile } from '../../features/profile/domain';
import { useUserStore } from '../../store/useUserStore';

const GAUGE_SEGMENTS = 20;

export default function HomeRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((state) => state.profile);
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const discoveryProfile = toDiscoveryUserProfile(applicantProfile);
  const xp = useUserStore((state) => state.xp);
  const todayQuizDone = useUserStore((state) => state.todayQuizDone);
  const savedListingIds = useDiscoveryStore((state) => state.savedListingIds);
  const dataset = useListingDataset();

  const level = getLevel(xp);
  const score = calculatePreparationScore(profile);
  const stage = getStage(score);
  const accountKnown = applicantProfile.subscriptionAccount.hasAccount.status === 'known';
  const actions = accountKnown
    ? getRecommendedActions(profile)
    : ['청약통장 정보를 확인하면 준비도를 더 정확하게 볼 수 있어요.', ...getRecommendedActions(profile).slice(1)];
  const inTwoYears = simulateFuture(profile, 2);
  const delta = inTwoYears.preparationScore - score;

  const savedListings = resolveSavedListings(dataset.listings, savedListingIds);
  const suggested = getHomeRecommendations(dataset.listings, discoveryProfile, savedListingIds, 3);

  const watchlist = savedListings.length > 0 ? savedListings.slice(0, 3) : suggested;

  const nextChange = !accountKnown
    ? '정보 확인'
    : !profile.hasSubscriptionAccount
    ? '통장 확인'
    : profile.accountMonths < MILESTONE_MONTHS
      ? `${MILESTONE_MONTHS - profile.accountMonths}개월`
      : '유지 중';

  const profileCompleteness = calculateProfileCompleteness(applicantProfile);

  /**
   * getRecommendedActions 는 통장 / 납입 / 무주택·학습 순서로 3개를 돌려준다.
   * 문구를 파싱하지 않고 같은 프로필 상태로 목적지를 정한다.
   * 새 도메인 규칙을 만들지 않고 기존 route 만 쓴다.
   */
  const todos = actions.map((action, index) => {
    const target =
      index === 0
        ? !accountKnown || !profile.hasSubscriptionAccount
          ? { href: '/profile' as const, label: '청약 프로필' }
          : { href: '/preparation' as const, label: '준비 로드맵' }
        : index === 1
          ? profile.monthlyPayment <= 0
            ? { href: '/profile' as const, label: '청약 프로필' }
            : { href: '/future' as const, label: '미래의 나' }
          : profile.isNoHomeOwner
            ? { href: '/quiz' as const, label: '오늘의 퀴즈' }
            : { href: '/profile' as const, label: '청약 프로필' };
    return { action, ...target };
  });

  // 최초 등장·의미 있는 값 변경에서만 재생된다. 탭을 오갈 때마다 0부터 세지 않는다.
  const animatedScore = useCountUp(score);
  const filled = Math.round((animatedScore / 100) * GAUGE_SEGMENTS);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Monzo: 브랜드와 핵심 수치가 같은 컬러 surface 위에 있다. 헤더가 따로 떠 있지 않다. */}
        <LinearGradient
          colors={[colors.primaryContainer, colors.primary]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.band, { paddingTop: Math.max(insets.top, 12) + 8 }]}
        >
          <View style={styles.bandGlow} />

          <View style={styles.brandRow}>
            <BrandMark size={30} />
            <Text style={styles.wordmark}>완판e</Text>
            <View style={styles.spacer} />
            <View style={styles.levelPill}>
              <MaterialIcons name="bolt" size={13} color={colors.onPrimary} />
              <Text style={styles.levelPillText}>
                Lv.{level.level} · {xp} XP
              </Text>
            </View>
          </View>

          <Text style={styles.bandLabel}>{profile.name}님의 청약 준비도</Text>

          <View style={styles.scoreRow}>
            <Text style={styles.score}>{animatedScore}</Text>
            <Text style={styles.scoreUnit}>점</Text>
            {delta > 0 ? (
              <View style={styles.deltaChip}>
                <MaterialIcons name="arrow-drop-up" size={17} color={colors.onPrimary} />
                <Text style={styles.deltaText}>2년 뒤 +{delta}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.gauge}>
            {Array.from({ length: GAUGE_SEGMENTS }, (_, i) => (
              <View key={i} style={[styles.segment, i < filled && styles.segmentOn]} />
            ))}
          </View>

          <View style={styles.bandFoot}>
            <Text style={styles.stageText}>
              {stage.emoji} {stage.label}
            </Text>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={`내 청약 프로필 ${profileCompleteness}%`}
              onPress={() => router.push('/profile')}
              style={styles.profileEntry}
            >
              <Text style={styles.profileText}>내 청약 프로필 {profileCompleteness}%</Text>
              <MaterialIcons name="chevron-right" size={14} color="rgba(255,255,255,0.8)" />
            </MotionPressable>
          </View>
        </LinearGradient>

        {/* Monzo: 밴드 아래는 하나의 연속 surface. 카드를 여러 장 띄우지 않는다. */}
        <View style={styles.sheet}>
          <Appear delay={stagger.normal} distance={travel.content} style={styles.statRow}>
            <Stat label="다음 변화" value={nextChange} lead />
            <View style={styles.statDivider} />
            <Stat label="오늘 학습" value={todayQuizDone ? `+${XP_PER_QUIZ} XP` : '아직'} />
            <View style={styles.statDivider} />
            <Stat label="관심 청약" value={`${savedListings.length}곳`} />
          </Appear>

          <View style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>
                {savedListings.length > 0 ? '관심 청약' : '먼저 살펴볼 청약'}
              </Text>
              <MotionPressable
                accessibilityRole="button"
                onPress={() => router.push('/discovery')}
                style={styles.moreLink}
              >
                <Text style={styles.moreLinkText}>전체 보기</Text>
                <MaterialIcons name="chevron-right" size={15} color={colors.primary} />
              </MotionPressable>
            </View>

            <Text style={styles.listingContext}>
              {dataset.isFallback
                ? '실제 공고 연결에 실패해 데모 데이터 기준으로 보여드려요.'
                : savedListings.length > 0
                  ? '청약찾기와 같은 실제 공고 목록에서 저장한 항목이에요.'
                  : '현재 확인된 프로필 정보 기준 · 자격 판정이 아닌 관심 순서예요.'}
            </Text>

            {dataset.status === 'loading' ? (
              <View style={styles.listingState}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.listingStateText}>청약홈 실제 공고를 불러오는 중이에요</Text>
              </View>
            ) : dataset.status === 'error' ? (
              <View style={styles.listingState}>
                <MaterialIcons name="error-outline" size={18} color={colors.warning} />
                <Text style={styles.listingStateText}>공고를 불러오지 못했어요.</Text>
                <MotionPressable accessibilityRole="button" onPress={() => void dataset.retry()} style={styles.inlineRetry}>
                  <Text style={styles.inlineRetryText}>다시 시도</Text>
                </MotionPressable>
              </View>
            ) : watchlist.length === 0 ? (
              <View style={styles.listingState}>
                <Text style={styles.listingStateText}>현재 표시할 모집중·모집예정 공고가 없어요.</Text>
              </View>
            ) : watchlist.map((listing, index) => {
              const relevance = getListingRelevance(discoveryProfile, listing);
              const open = listing.recruitmentStatus === 'open';
              const priceLabel = hasListingPrice(listing)
                ? formatPrice(listing.representativePrice).replace('억', '')
                : null;
              return (
                <MotionPressable
                  key={listing.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/discovery/[id]', params: { id: listing.id } })
                  }
                  style={[
                    styles.row,
                    index > 0 && styles.rowDivider,
                  ]}
                >
                  <View
                    style={[
                      styles.rowTile,
                      {
                        backgroundColor:
                          relevance.level === 'high' ? tint.purple.bg : colors.surfaceContainer,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="apartment"
                      size={17}
                      color={relevance.level === 'high' ? colors.primary : colors.textSubtle}
                    />
                  </View>

                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {listing.complexName}
                    </Text>
                    <View style={styles.rowMetaLine}>
                      <View style={[styles.dot, open && styles.dotOpen]} />
                      <Text style={styles.rowMeta}>
                        {RECRUITMENT_STATUS_LABEL[listing.recruitmentStatus]} · {listing.district}
                      </Text>
                    </View>
                  </View>

                  {/* Monzo: 값은 우측 정렬, 단위는 숫자보다 작게. */}
                  <Text style={styles.rowValue}>
                    {priceLabel ?? '가격 확인'}
                    {priceLabel ? <Text style={styles.rowValueUnit}>억</Text> : null}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>

          <View style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitleSub}>오늘 할 일</Text>
            </View>

            {todos.map(({ action, href, label }, index) => (
              <MotionPressable
                key={action}
                accessibilityRole="button"
                accessibilityLabel={`${action} ${label}(으)로 이동`}
                onPress={() => router.push(href)}
                style={[styles.todoRow, index > 0 && styles.rowDivider]}
              >
                <View style={[styles.bullet, index === 0 && styles.bulletLead]} />
                <Text
                  style={[styles.todoText, index === 0 && styles.todoTextLead]}
                  numberOfLines={2}
                >
                  {action}
                </Text>
                <MaterialIcons name="chevron-right" size={16} color={colors.outline} style={styles.todoChevron} />
              </MotionPressable>
            ))}

            <View style={styles.footNote}>
              <Disclaimer />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, lead }: { label: string; value: string; lead?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, lead && styles.statLabelLead]}>{label}</Text>
      <Text style={[styles.statValue, lead && styles.statValueLead]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  screen: { flex: 1, height: '100%', backgroundColor: colors.surface },
  scroll: { paddingBottom: 24 },
  spacer: { flex: 1 },

  band: { paddingHorizontal: SIDE, paddingBottom: 30, overflow: 'hidden' },
  bandGlow: {
    pointerEvents: 'none',
    position: 'absolute',
    right: -60,
    top: -70,
    width: 190,
    height: 190,
    borderRadius: radius.pill,
    backgroundColor: overlay.glow,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: {
    ...type.title,
    fontSize: 21,
    lineHeight: 27,
    color: colors.onPrimary,
    letterSpacing: tracking.tight,
  },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9,
  },
  levelPillText: { ...type.micro, color: colors.onPrimary },

  bandLabel: { ...type.label, color: 'rgba(255,255,255,0.76)', marginTop: 22 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 2 },
  score: {
    ...numeric,
    fontFamily: type.metric.fontFamily,
    fontSize: 44,
    lineHeight: 52,
    color: colors.onPrimary,
    letterSpacing: tracking.display,
  },
  scoreUnit: { ...type.bodyLgStrong, color: 'rgba(255,255,255,0.7)', marginLeft: 2 },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginLeft: 9,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingRight: 9,
    paddingLeft: 2,
  },
  deltaText: { ...type.micro, color: colors.onPrimary },

  gauge: { flexDirection: 'row', gap: 2, marginTop: 14 },
  segment: { flex: 1, height: 5, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.24)' },
  segmentOn: { backgroundColor: colors.onPrimary },

  bandFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  stageText: { ...type.bodySmStrong, color: colors.onPrimary, letterSpacing: tracking.normal },
  profileEntry: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  profileText: { ...type.micro, color: 'rgba(255,255,255,0.72)' },

  sheet: {
    marginTop: -18,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 4,
  },

  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: SIDE,
    paddingTop: 14,
    paddingBottom: 15,
  },
  stat: { flex: 1, gap: 2 },
  statLabel: { ...type.micro, color: colors.textSubtle },
  statLabelLead: { color: colors.primary },
  statValue: { ...type.bodySmStrong, color: colors.textMuted, letterSpacing: tracking.normal },
  statValueLead: { ...type.cardTitle, color: colors.text, letterSpacing: tracking.snug },
  statDivider: { width: 1, backgroundColor: colors.hairline, marginHorizontal: 12 },

  group: { borderTopWidth: 8, borderTopColor: colors.surfaceLow, paddingHorizontal: SIDE },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 4,
  },
  groupTitle: { ...type.bodyLgStrong, color: colors.text, letterSpacing: tracking.snug },
  groupTitleSub: { ...type.label, color: colors.textMuted },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: 1, paddingVertical: 4 },
  moreLinkText: { ...type.label, color: colors.primary, letterSpacing: tracking.normal },
  listingContext: { ...type.micro, color: colors.textSubtle, paddingTop: 3, paddingBottom: 4 },
  listingState: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listingStateText: { ...type.caption, color: colors.textMuted, flex: 1 },
  inlineRetry: { borderRadius: radius.pill, backgroundColor: colors.lavender, paddingHorizontal: 10, paddingVertical: 6 },
  inlineRetryText: { ...type.micro, color: colors.primary },

  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTile: {
    width: 36,
    height: 36,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { ...type.rowTitle, color: colors.text },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.outline },
  dotOpen: { backgroundColor: colors.success },
  rowMeta: { ...type.micro, color: colors.textSubtle },
  rowValue: {
    ...numeric,
    fontFamily: type.metric.fontFamily,
    fontSize: 19,
    lineHeight: 25,
    color: colors.text,
    letterSpacing: tracking.tight,
  },
  rowValueUnit: { ...type.label, color: colors.textSubtle },

  todoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 11,
    // 두 줄짜리 항목이 있어도 한 줄짜리가 최소 터치 영역 아래로 내려가지 않게 한다.
    minHeight: size.touch,
  },
  /** 본문 첫 줄에 맞춘다. bodySm lineHeight(21) 와 아이콘(16) 의 차이 절반. */
  todoChevron: { marginTop: 3 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.outline, marginTop: 8 },
  bulletLead: { width: 6, height: 6, backgroundColor: colors.primary, marginTop: 7 },
  todoText: { ...type.bodySm, color: colors.textSubtle, flex: 1, letterSpacing: tracking.normal },
  todoTextLead: { ...type.bodySmStrong, color: colors.text },

  footNote: { paddingTop: 14, paddingBottom: 6 },
});
