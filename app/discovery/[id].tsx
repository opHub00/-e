import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { Appear } from '../../components/motion/Appear';
import { ScreenEnter } from '../../components/motion/ScreenEnter';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconChip } from '../../components/IconChip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusPill } from '../../components/StatusPill';
import { colors, radius, shadow, size, spacing, tint, type } from '../../design/tokens';
import {
  formatHouseholdCount,
  formatPrice,
  formatRecruitmentSchedule,
  getListingRelevance,
  hasListingPrice,
  RECRUITMENT_STATUS_LABEL,
} from '../../features/discovery/domain';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';
import { getStoriesForListing } from '../../features/discovery/stories';
import type { DiscoveryListing, ListingStory } from '../../features/discovery/types';
import { useDiscoveryStore } from '../../features/discovery/useDiscoveryStore';
import { useUserStore } from '../../store/useUserStore';

type DetailTab = 'info' | 'conditions' | 'stories';

export default function DiscoveryDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = useUserStore((state) => state.profile);
  const savedListingIds = useDiscoveryStore((state) => state.savedListingIds);
  const toggleSavedListing = useDiscoveryStore((state) => state.toggleSavedListing);
  const dataset = useListingDataset();
  const { listings: discoveryListings } = dataset;
  const [tab, setTab] = useState<DetailTab>('info');
  const listing = discoveryListings.find((item) => item.id === id);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/discovery' as Href);
  };

  const stories = useMemo(() => (listing ? getStoriesForListing(listing) : []), [listing]);

  if (dataset.status === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="청약 상세" eyebrow="DISCOVERY" onBack={goBack} />
        <View style={styles.notFound}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.notFoundBody}>청약홈 실제 공고를 불러오는 중이에요</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="청약 상세" eyebrow="DISCOVERY" onBack={goBack} />
        <View style={styles.notFound}>
          <IconChip name="search-off" tone="pink" size="md" />
          <Text style={styles.notFoundTitle}>청약 공고를 찾지 못했어요</Text>
          <Text style={styles.notFoundBody}>
            {dataset.isFallback
              ? '실제 공고를 불러오지 못해 현재 데모 목록만 확인할 수 있어요.'
              : '목록으로 돌아가 다른 청약을 살펴보세요.'}
          </Text>
          <PrimaryButton
            label="청약찾기로 돌아가기"
            icon="arrow-back"
            onPress={() => router.replace('/discovery' as Href)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const relevance = getListingRelevance(profile, listing);
  const saved = savedListingIds.includes(listing.id);

  return (
    <ScreenEnter>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="청약 상세" eyebrow="DISCOVERY" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.detailHead}>
          <View style={styles.detailTopRow}>
            <View
              style={[
                styles.detailStatus,
                listing.recruitmentStatus === 'open' && styles.detailStatusOpen,
                listing.recruitmentStatus === 'upcoming' && styles.detailStatusSoon,
              ]}
            >
              <Text
                style={[
                  styles.detailStatusText,
                  listing.recruitmentStatus === 'open' && styles.detailStatusTextOpen,
                  listing.recruitmentStatus === 'upcoming' && styles.detailStatusTextSoon,
                ]}
              >
                {RECRUITMENT_STATUS_LABEL[listing.recruitmentStatus]}
              </Text>
            </View>
            <Text style={styles.detailPlace}>
              {listing.region} · {listing.district}
            </Text>
          </View>

          <Text style={styles.detailName}>{listing.complexName}</Text>
          <Text style={styles.detailAddress}>{listing.address}</Text>

          <View style={styles.detailRelevance}>
            <MaterialIcons name="auto-awesome" size={14} color={colors.primary} />
            <Text style={styles.detailRelevanceText}>{relevance.label}</Text>
            <Text style={styles.detailRelevanceNote}>
              내 설정과 공고 정보를 바탕으로 정리했어요
            </Text>
          </View>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <TabButton label="정보" icon="dashboard" active={tab === 'info'} onPress={() => setTab('info')} />
          <TabButton label="조건" icon="fact-check" active={tab === 'conditions'} onPress={() => setTab('conditions')} />
          <TabButton label="이야기" icon="forum" active={tab === 'stories'} onPress={() => setTab('stories')} />
        </View>

        <Appear replayKey={tab} distance={0}>
          {tab === 'info' ? <InformationTab listing={listing} /> : null}
          {tab === 'conditions' ? (
            <ConditionsTab
              profileName={profile.name}
              relevance={relevance}
              checkpoints={listing.checkpoints}
              interestTags={listing.interestTags}
            />
          ) : null}
          {tab === 'stories' ? (
            <StoriesTab listingName={listing.complexName} stories={stories} isDemo={listing.isDemo} />
          ) : null}
        </Appear>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={saved ? '저장됨 · 관심 청약에서 빼기' : '관심 청약으로 저장'}
          icon={saved ? 'bookmark' : 'bookmark-border'}
          variant={saved ? 'soft' : 'primary'}
          onPress={() => toggleSavedListing(listing.id)}
        />
      </View>
    </SafeAreaView>
    </ScreenEnter>
  );
}

type FactRow = { label: string; value: string } | null;

/** 값이 있는 행만 divider 로 이어 붙인다. 없는 항목은 자리도 만들지 않는다. */
function FactGroup({ label, rows }: { label: string; rows: FactRow[] }) {
  const items = rows.filter((row): row is { label: string; value: string } => row !== null);
  if (items.length === 0) return null;
  return (
    <View style={styles.factGroup}>
      <Text style={styles.factGroupLabel}>{label}</Text>
      {items.map((row, index) => (
        <View key={row.label} style={[styles.factRow, index > 0 && styles.factRowDivider]}>
          <Text style={styles.factRowLabel}>{row.label}</Text>
          <Text style={styles.factRowValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function InformationTab({ listing }: { listing: DiscoveryListing }) {

  return (
    <View style={styles.tabContent}>
      {/* 카드 대신 divider 행. 값이 없는 항목은 배열에서 빠져 자리도 남지 않는다. */}
      <FactGroup
        label="청약 일정"
        rows={[
          listing.announcementDate ? { label: '모집공고일', value: listing.announcementDate } : null,
          listing.recruitmentStartDate || listing.recruitmentEndDate
            ? { label: '접수 기간', value: formatRecruitmentSchedule(listing) }
            : null,
          listing.winnerAnnouncementDate
            ? { label: '당첨자 발표일', value: listing.winnerAnnouncementDate }
            : null,
        ]}
      />

      <FactGroup
        label="공급 정보"
        rows={[
          { label: '공급 유형', value: listing.supplyType },
          { label: '주택 유형', value: listing.housingType },
          listing.householdCount !== null
            ? { label: '세대수', value: formatHouseholdCount(listing.householdCount) }
            : null,
          hasListingPrice(listing)
            ? { label: '대표 가격', value: formatPrice(listing.representativePrice) }
            : null,
          { label: '주소', value: listing.address },
        ]}
      />

      {listing.contractStartDate || listing.contractEndDate ? (
        <FactGroup
          label="계약"
          rows={[
            {
              label: '계약 기간',
              value: [listing.contractStartDate, listing.contractEndDate]
                .filter(Boolean)
                .join(' – '),
            },
          ]}
        />
      ) : null}

      {listing.announcementUrl || listing.homepageUrl ? (
        <View style={styles.sourceLinks}>
          {listing.announcementUrl ? (
            <MotionPressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(listing.announcementUrl!)}
              style={styles.sourceLink}
            >
              <MaterialIcons name="description" size={18} color={colors.primary} />
              <Text style={styles.sourceLinkText}>모집공고 원문 보기</Text>
              <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
            </MotionPressable>
          ) : null}
          {listing.homepageUrl ? (
            <MotionPressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(listing.homepageUrl!)}
              style={styles.sourceLink}
            >
              <MaterialIcons name="language" size={18} color={colors.primary} />
              <Text style={styles.sourceLinkText}>분양 홈페이지 보기</Text>
              <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
            </MotionPressable>
          ) : null}
        </View>
      ) : null}

      {listing.isDemo ? <DemoNotice /> : null}
    </View>
  );
}

function ConditionsTab({
  profileName,
  relevance,
  checkpoints,
  interestTags,
}: {
  profileName: string;
  relevance: ReturnType<typeof getListingRelevance>;
  checkpoints: string[];
  interestTags: string[];
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.relevanceHero}>
        <View style={styles.relevanceTop}>
          <IconChip name="auto-awesome" tone="purple" size="md" />
          <StatusPill
            label={relevance.label}
            tone={relevance.level === 'high' ? 'green' : relevance.level === 'worth' ? 'purple' : 'amber'}
          />
        </View>
        <Text style={styles.relevanceEyebrow}>FOR {profileName.toUpperCase()}</Text>
        <Text style={styles.relevanceTitle}>내 조건과의 관련성</Text>
        <Text style={styles.relevanceIntro}>자격 판정이 아니라 먼저 확인할 관심 순서를 설명해요.</Text>
        <View style={styles.relevanceReasons}>
          {relevance.reasons.map((reason) => (
            <View key={reason} style={styles.relevanceReason}>
              <MaterialIcons name="check-circle" size={18} color={colors.primary} />
              <Text style={styles.relevanceReasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      </View>

      <SectionHeading eyebrow="CHECK FIRST" title="확인해야 할 조건" icon="rule" />
      <View style={styles.checkpointList}>
        {checkpoints.map((checkpoint, index) => (
          <View key={checkpoint} style={styles.checkpointCard}>
            <View style={styles.checkpointNumber}>
              <Text style={styles.checkpointNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.checkpointText}>{checkpoint}</Text>
            <MaterialIcons name="open-in-new" size={17} color={colors.outline} />
          </View>
        ))}
      </View>

      <View style={styles.tagCard}>
        <Text style={styles.tagTitle}>관련 태그</Text>
        <View style={styles.tagRow}>
          {interestTags.map((tag) => (
            <Text key={tag} style={styles.tag}>#{tag.replace(' ', '')}</Text>
          ))}
        </View>
      </View>

      <View style={styles.officialNotice}>
        <MaterialIcons name="verified-user" size={20} color={colors.warning} />
        <View style={styles.officialCopy}>
          <Text style={styles.officialTitle}>공식 모집공고 확인이 필요해요</Text>
          <Text style={styles.officialBody}>
            완판e는 신청 가능 여부, 자격 충족, 순위 또는 당첨 가능성을 판단하지 않아요.
          </Text>
        </View>
      </View>
    </View>
  );
}

function StoriesTab({
  listingName,
  stories,
  isDemo,
}: {
  listingName: string;
  stories: ListingStory[];
  isDemo: boolean;
}) {
  if (!isDemo) {
    // 실제 공고에는 커뮤니티 데이터가 없다. 작성 기능이 없으므로 CTA 를 만들지 않는다.
    return (
      <View style={styles.tabContent}>
        <View style={styles.emptyStories}>
          <MaterialIcons name="forum" size={22} color={colors.outline} />
          <Text style={styles.emptyStoriesTitle}>아직 등록된 이야기가 없어요</Text>
          <Text style={styles.emptyStoriesBody}>
            이 공고에 대한 이야기가 생기면 여기에서 확인할 수 있어요.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.storyHero}>
        <IconChip name="forum" tone="purple" size="md" />
        <View style={styles.storyHeroCopy}>
          <Text style={styles.storyEyebrow}>LISTING STORIES · DEMO</Text>
          <Text style={styles.storyTitle}>{listingName} 이야기</Text>
          <Text style={styles.storyIntro}>이 청약을 저장한 사람들이 무엇을 확인하는지 가볍게 둘러봐요.</Text>
        </View>
      </View>

      <View style={styles.readonlyNote}>
        <MaterialIcons name="lock-outline" size={17} color={colors.primary} />
        <Text style={styles.readonlyText}>V1은 읽기 전용 Mock이에요. 게시·댓글·서버 기능은 없어요.</Text>
      </View>

      <View style={styles.storyList}>
        {stories.map((story) => (
          <View key={story.id} style={styles.storyCard}>
            <View style={styles.storyTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{story.author.slice(0, 1)}</Text>
              </View>
              <View style={styles.authorCopy}>
                <Text style={styles.author}>{story.author}</Text>
                <Text style={styles.storyTime}>{story.relativeTime}</Text>
              </View>
              <MaterialIcons name="more-horiz" size={19} color={colors.outline} />
            </View>
            <Text style={styles.storyBody}>{story.body}</Text>
            <View style={styles.storyActions}>
              <MaterialIcons name="favorite-border" size={17} color={colors.textMuted} />
              <Text style={styles.storyLikes}>공감 {story.likes}</Text>
            </View>
          </View>
        ))}
      </View>
      <DemoNotice />
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}) {
  return (
    <View style={styles.sectionHeading}>
      <IconChip name={icon} tone="purple" />
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    </View>
  );
}

function DemoNotice() {
  return (
    <View style={styles.demoNotice}>
      <MaterialIcons name="science" size={18} color={colors.primary} />
      <Text style={styles.demoNoticeText}>
        이 화면의 단지·가격·일정·의견은 모두 데모 데이터예요.
      </Text>
    </View>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <MotionPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <MaterialIcons name={icon} size={17} color={active ? colors.onPrimary : colors.textMuted} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, height: '100%', backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.screen, paddingBottom: spacing.lg, gap: spacing.lg },

  detailHead: { gap: 4, paddingTop: 2 },
  detailTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailStatus: {
    height: 22,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 9,
  },
  detailStatusOpen: { backgroundColor: tint.green.bg },
  detailStatusSoon: { backgroundColor: tint.amber.bg },
  detailStatusText: { ...type.micro, color: colors.textSubtle },
  detailStatusTextOpen: { color: tint.green.fg },
  detailStatusTextSoon: { color: tint.amber.fg },
  detailPlace: { ...type.micro, color: colors.textSubtle },
  detailName: { ...type.page, fontSize: 22, lineHeight: 30, color: colors.text, letterSpacing: -0.5, marginTop: 6 },
  detailAddress: { ...type.caption, color: colors.textMuted },
  detailRelevance: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
  detailRelevanceText: { ...type.label, color: colors.primary },
  detailRelevanceNote: { ...type.micro, color: colors.textSubtle },

  factGroup: {
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 2,
  },
  factGroupLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: 0.6, marginBottom: 2 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 11,
  },
  factRowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  factRowLabel: { ...type.bodySm, color: colors.textSubtle },
  factRowValue: { ...type.bodySmStrong, color: colors.text, flex: 1, textAlign: 'right', letterSpacing: -0.2 },
  tabs: { flexDirection: 'row', gap: spacing.xs, borderRadius: radius.card, backgroundColor: colors.surfaceContainer, padding: spacing.xs },
  tabButton: { flex: 1, minHeight: size.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.cardSm },
  tabButtonActive: { backgroundColor: colors.primary, ...shadow.card },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextActive: { color: colors.onPrimary },
  tabContent: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionEyebrow: { ...type.caption, color: colors.primary },
  sectionTitle: { ...type.title, color: colors.text },
  sourceLinks: { gap: spacing.sm },
  sourceLink: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.primaryFixed, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  sourceLinkText: { ...type.bodyStrong, color: colors.primary, flex: 1 },
  relevanceHero: { gap: spacing.sm, borderRadius: radius.bento, borderWidth: 1, borderColor: colors.primaryFixed, backgroundColor: colors.lavender, padding: spacing.lg, ...shadow.card },
  relevanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  relevanceEyebrow: { ...type.caption, color: colors.primary, marginTop: spacing.sm },
  relevanceTitle: { ...type.headline, color: colors.text },
  relevanceIntro: { ...type.body, color: colors.textMuted },
  relevanceReasons: { gap: spacing.sm, marginTop: spacing.sm },
  relevanceReason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.card, backgroundColor: colors.surface, padding: 12 },
  relevanceReasonText: { ...type.body, color: colors.text, flex: 1 },
  checkpointList: { gap: spacing.sm },
  checkpointCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface, padding: 12 },
  checkpointNumber: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  checkpointNumberText: { ...type.label, color: colors.primary },
  checkpointText: { ...type.bodyStrong, color: colors.text, flex: 1 },
  tagCard: { gap: spacing.sm, borderRadius: radius.card, backgroundColor: colors.surfaceLow, padding: spacing.md },
  tagTitle: { ...type.label, color: colors.textMuted },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { ...type.caption, color: colors.primary, backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  officialNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: '#F2DDCB', backgroundColor: '#FFF7EF', padding: spacing.md },
  officialCopy: { flex: 1, gap: spacing.xs },
  officialTitle: { ...type.bodyStrong, color: colors.text },
  officialBody: { ...type.caption, color: colors.textMuted },
  emptyStories: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 46,
    paddingHorizontal: spacing.lg,
  },
  emptyStoriesTitle: { ...type.bodySmStrong, color: colors.textMuted, marginTop: 2 },
  emptyStoriesBody: { ...type.caption, color: colors.textSubtle, textAlign: 'center', lineHeight: 19 },
  storyHero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radius.bento, borderWidth: 1, borderColor: colors.primaryFixed, backgroundColor: colors.lavender, padding: spacing.lg },
  storyHeroCopy: { flex: 1, gap: spacing.xs },
  storyEyebrow: { ...type.caption, color: colors.primary },
  storyTitle: { ...type.title, color: colors.text },
  storyIntro: { ...type.body, color: colors.textMuted },
  readonlyNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: 12 },
  readonlyText: { ...type.caption, color: colors.textMuted, flex: 1 },
  storyList: { gap: spacing.sm },
  storyCard: { gap: spacing.sm, borderRadius: radius.bento, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface, padding: spacing.md, ...shadow.card },
  storyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  avatarText: { ...type.label, color: colors.primary },
  authorCopy: { flex: 1 },
  author: { ...type.label, color: colors.text },
  storyTime: { ...type.caption, color: colors.textMuted },
  storyBody: { ...type.body, color: colors.text },
  storyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  storyLikes: { ...type.caption, color: colors.textMuted },
  demoNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: 12 },
  demoNoticeText: { ...type.caption, color: colors.textMuted, flex: 1 },
  footer: { paddingHorizontal: spacing.screen, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceHigh, backgroundColor: colors.surface, ...shadow.floating },
  notFound: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.screen },
  notFoundTitle: { ...type.title, color: colors.text },
  notFoundBody: { ...type.body, color: colors.textMuted },
});
