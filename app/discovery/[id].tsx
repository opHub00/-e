import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { Appear } from '../../components/motion/Appear';
import { ScreenEnter } from '../../components/motion/ScreenEnter';
import { ProfilePromptSheet } from '../../components/ProfilePromptSheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconChip } from '../../components/IconChip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusPill } from '../../components/StatusPill';
import { duration, stagger, travel } from '../../design/motion';
import { colors, numeric, radius, shadow, size, spacing, tint, tracking, type } from '../../design/tokens';
import {
  formatHouseholdCount,
  formatPrice,
  formatRecruitmentSchedule,
  hasListingPrice,
  RECRUITMENT_STATUS_LABEL,
} from '../../features/discovery/domain';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';
import { getStoriesForListing } from '../../features/discovery/stories';
import type { DiscoveryListing, ListingStory } from '../../features/discovery/types';
import { useDiscoveryStore } from '../../features/discovery/useDiscoveryStore';
import {
  PROFILE_BUNDLES,
  type ProfileQuestionBundleId,
} from '../../features/profile/domain';
import {
  evaluateListingPersonalFit,
  type ListingPersonalFitCheckStatus,
  type ListingPersonalFitResult,
} from '../../features/listingFit/personalFit';
import { buildListingFitExplanationContext } from '../../features/listingFit/ai';
import { useUserStore } from '../../store/useUserStore';
import { formatOfficialCompetitionRate } from '../../features/competition/auditAdapter';
import { buildCompetitionAiSummary } from '../../features/competition/domain';
import {
  useListingCompetition,
  type ListingCompetitionSnapshot,
} from '../../features/competition/useListingCompetition';

type DetailTab = 'info' | 'conditions' | 'stories';

export default function DiscoveryDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const dismissProfileBundle = useUserStore((state) => state.dismissProfileBundle);
  const savedListingIds = useDiscoveryStore((state) => state.savedListingIds);
  const toggleSavedListing = useDiscoveryStore((state) => state.toggleSavedListing);
  const dataset = useListingDataset();
  const { listings: discoveryListings } = dataset;
  const [tab, setTab] = useState<DetailTab>('info');
  const [promptBundleId, setPromptBundleId] = useState<ProfileQuestionBundleId | null>(null);
  const listing = discoveryListings.find((item) => item.id === id);
  const competitionState = useListingCompetition(listing);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/discovery' as Href);
  };

  const stories = useMemo(() => (listing ? getStoriesForListing(listing) : []), [listing]);
  const personalFit = useMemo(
    () => (listing ? evaluateListingPersonalFit(listing, applicantProfile) : null),
    [applicantProfile, listing],
  );

  if (dataset.status === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="청약 상세" onBack={goBack} />
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
        <ScreenHeader title="청약 상세" onBack={goBack} />
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

  if (!personalFit) return null;
  const saved = savedListingIds.includes(listing.id);

  const openProfilePrompt = () => setPromptBundleId(personalFit.missingBundles[0] ?? null);
  const editProfileBundle = (bundleId: ProfileQuestionBundleId) => {
    setPromptBundleId(null);
    router.push({
      pathname: '/profile',
      params: { bundle: bundleId, returnTo: `/discovery/${listing.id}` },
    });
  };
  const askAiAboutFit = () => {
    const explanationContext = buildListingFitExplanationContext(
      listing,
      personalFit,
      buildCompetitionAiSummary(competitionState.competition),
    );
    router.push({
      pathname: '/ai',
      params: {
        q: `${listing.complexName} 공고가 현재 확인된 내 조건과 어떻게 맞는지 쉽게 설명해 주세요.`,
        auto: '1',
        listingFit: JSON.stringify(explanationContext),
      },
    });
  };

  return (
    <ScreenEnter>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="청약 상세" onBack={goBack} />

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
        </View>

        <Appear delay={stagger.short} distance={travel.content}>
          <PersonalFitSection result={personalFit} onCompleteProfile={openProfilePrompt} />
        </Appear>

        <Appear delay={stagger.normal} distance={travel.content}>
          <CompetitionSection snapshot={competitionState} />
        </Appear>

        <View style={styles.tabs} accessibilityRole="tablist">
          <TabButton label="정보" icon="dashboard" active={tab === 'info'} onPress={() => setTab('info')} />
          <TabButton label="조건" icon="fact-check" active={tab === 'conditions'} onPress={() => setTab('conditions')} />
          <TabButton label="이야기" icon="forum" active={tab === 'stories'} onPress={() => setTab('stories')} />
        </View>

        {/* 탭 내용은 통째로 바뀌므로 아주 짧게만 이어준다. content 길이면 전환이 번쩍인다. */}
        <Appear replayKey={tab} distance={0} durationMs={duration.micro}>
          {tab === 'info' ? <InformationTab listing={listing} /> : null}
          {tab === 'conditions' ? (
            <ConditionsTab
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
        <MotionPressable
          accessibilityRole="button"
          onPress={askAiAboutFit}
          style={styles.aiLink}
        >
          <MaterialIcons name="auto-awesome" size={17} color={colors.primary} />
          <Text style={styles.aiLinkText}>내 조건과 이 공고를 AI에게 설명 듣기</Text>
        </MotionPressable>
        <PrimaryButton
          label={saved ? '저장됨 · 관심 청약에서 빼기' : '관심 청약으로 저장'}
          icon={saved ? 'bookmark' : 'bookmark-border'}
          variant={saved ? 'soft' : 'primary'}
          onPress={() => toggleSavedListing(listing.id)}
        />
      </View>

      <ProfilePromptSheet
        bundleId={promptBundleId}
        onEdit={editProfileBundle}
        onLater={(bundleId) => {
          dismissProfileBundle(bundleId);
          setPromptBundleId(null);
        }}
      />
    </SafeAreaView>
    </ScreenEnter>
  );
}

function CompetitionSection({ snapshot }: { snapshot: ListingCompetitionSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const competition = snapshot.competition;
  const generalRows = competition?.generalRows ?? [];
  const specialRows = competition?.specialSupplyRows ?? [];
  const generalLimit = expanded ? 30 : 6;
  const specialLimit = expanded ? 20 : 4;

  return (
    <View style={styles.competitionCard}>
      <View style={styles.competitionHeading}>
        <IconChip name="groups" tone="green" size="md" />
        <View style={styles.competitionHeadingCopy}>
          <Text style={styles.competitionEyebrow}>공식 자료 · 참고 정보</Text>
          <Text style={styles.competitionTitle}>청약 경쟁 정보</Text>
        </View>
        {snapshot.status === 'available' ? <StatusPill label="공식 데이터" tone="green" /> : null}
      </View>

      <Appear replayKey={`${snapshot.requestStatus}:${snapshot.status}`} distance={0} durationMs={duration.content}>
      {snapshot.requestStatus === 'loading' ? (
        <View style={styles.competitionStateRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.competitionStateText}>청약Home 공식 접수 결과를 확인하고 있어요.</Text>
        </View>
      ) : snapshot.requestStatus === 'error' ? (
        <View style={styles.competitionStateBlock}>
          <Text style={styles.competitionStateTitle}>공식 경쟁정보를 잠시 확인할 수 없어요</Text>
          <Text style={styles.competitionStateText}>내 조건 분석과 공고 정보는 그대로 볼 수 있어요.</Text>
          <MotionPressable accessibilityRole="button" onPress={snapshot.retry} style={styles.competitionRetry}>
            <MaterialIcons name="refresh" size={17} color={colors.primary} />
            <Text style={styles.competitionRetryText}>다시 확인하기</Text>
          </MotionPressable>
        </View>
      ) : snapshot.status === 'not_started' ? (
        <Text style={styles.competitionStateText}>아직 접수 전이에요. 접수 결과가 공개되면 확인할 수 있어요.</Text>
      ) : snapshot.status === 'in_progress' ? (
        <Text style={styles.competitionStateText}>접수가 진행 중이에요. 최종 경쟁률은 접수 종료 후 확인해 주세요.</Text>
      ) : snapshot.status === 'not_available' ? (
        <Text style={styles.competitionStateText}>현재 공식 데이터에서 이 공고의 경쟁률을 확인할 수 없어요.</Text>
      ) : competition ? (
        <>
          {generalRows.length > 0 ? (
            <View style={styles.competitionGroup}>
              <Text style={styles.competitionGroupTitle}>
                {competition.identifier.sourceType === 'apt' ? '일반공급' : '잔여세대'} · 주택형별 공식 결과
              </Text>
              {generalRows.slice(0, generalLimit).map((row, index) => (
                <View
                  key={`${row.operation}-${row.housingType}-${row.rankCode ?? 'none'}-${row.residenceCode ?? row.remnantAnnouncementTypeCode ?? index}`}
                  style={[styles.competitionRow, index > 0 && styles.competitionRowDivider]}
                >
                  <View style={styles.competitionRowCopy}>
                    <Text style={styles.competitionRowTitle}>
                      {[row.housingType, row.rankCode ? `${row.rankCode}순위` : null, row.residenceName]
                        .filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.competitionRowMeta}>
                      공급 {row.suppliedUnits?.toLocaleString('ko-KR') ?? '확인 필요'}세대 · 신청 {row.applicants?.toLocaleString('ko-KR') ?? '확인 필요'}건
                    </Text>
                  </View>
                  <Text style={styles.competitionRate}>{formatOfficialCompetitionRate(row)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {specialRows.length > 0 ? (
            <View style={styles.competitionGroup}>
              <Text style={styles.competitionGroupTitle}>특별공급 · 공식 세대수와 신청건수</Text>
              {specialRows.slice(0, specialLimit).map((row, index) => (
                <View
                  key={`${row.housingType}-${row.category}-${index}`}
                  style={[styles.competitionRow, index > 0 && styles.competitionRowDivider]}
                >
                  <View style={styles.competitionRowCopy}>
                    <Text style={styles.competitionRowTitle}>{row.housingType} · {row.category}</Text>
                    <Text style={styles.competitionRowMeta}>
                      배정 {row.suppliedUnits.toLocaleString('ko-KR')}세대 · 신청 {row.applicants.toLocaleString('ko-KR')}건
                    </Text>
                  </View>
                  <Text style={styles.competitionRate}>
                    {row.calculatedCompetitionRate === null
                      ? '계산 불가'
                      : `${row.calculatedCompetitionRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} : 1`}
                  </Text>
                </View>
              ))}
              <Text style={styles.competitionCalculatedNote}>특별공급 비율은 같은 주택형·유형의 공식 배정세대수와 신청건수로 계산했어요.</Text>
            </View>
          ) : null}

          {generalRows.length > 6 || specialRows.length > 4 ? (
            <MotionPressable
              accessibilityRole="button"
              onPress={() => setExpanded((value) => !value)}
              style={styles.competitionExpand}
            >
              <Text style={styles.competitionExpandText}>{expanded ? '간단히 보기' : '기준별 결과 더 보기'}</Text>
              <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={19} color={colors.primary} />
            </MotionPressable>
          ) : null}

          {competition.source.partial ? (
            <Text style={styles.competitionPartial}>일부 공식 항목은 일시적으로 불러오지 못했어요.</Text>
          ) : null}
          <Text style={styles.competitionSource}>
            출처: {competition.source.provider} · {new Date(competition.source.fetchedAt).toLocaleString('ko-KR')}
          </Text>
          <Text style={styles.competitionDisclaimer}>
            공식 접수 결과를 기준별로 정리한 참고 정보예요. 경쟁률은 당첨 확률이 아니며 최종 정보는 청약Home에서 확인해 주세요.
          </Text>
        </>
      ) : null}
      </Appear>
    </View>
  );
}

function PersonalFitSection({
  result,
  onCompleteProfile,
}: {
  result: ListingPersonalFitResult;
  onCompleteProfile: () => void;
}) {
  const statusView = getFitStatusView(result.status);
  const nextBundle = PROFILE_BUNDLES.find((bundle) => bundle.id === result.missingBundles[0]);

  return (
    <View style={styles.fitCard}>
      <View style={styles.fitTop}>
        <View style={styles.fitHeading}>
          <IconChip name="person-search" tone="purple" size="md" />
          <View style={styles.fitHeadingCopy}>
            <Text style={styles.fitEyebrow}>내 조건 기준 · 참고 분석</Text>
            <Text style={styles.fitTitle}>내 조건과 보기</Text>
          </View>
        </View>
        <StatusPill label={statusView.label} tone={statusView.tone} />
      </View>

      <Text style={styles.fitSummary}>{result.summary}</Text>

      <View style={styles.fitChecks}>
        {result.checks.map((item) => {
          const view = getCheckStatusView(item.status);
          return (
            <View key={item.key} style={styles.fitCheck}>
              <View style={[styles.fitCheckIcon, { backgroundColor: view.background }]}>
                <MaterialIcons name={view.icon} size={17} color={view.color} />
              </View>
              <View style={styles.fitCheckCopy}>
                <View style={styles.fitCheckTitleRow}>
                  <Text style={styles.fitCheckLabel}>{item.label}</Text>
                  <Text style={[styles.fitCheckStatus, { color: view.color }]}>{view.label}</Text>
                </View>
                <Text style={styles.fitCheckReason}>{item.reason}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {nextBundle ? (
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={`${nextBundle.title} 정보 채우기`}
          onPress={onCompleteProfile}
          style={styles.fitProfileButton}
        >
          <MaterialIcons name="add-circle-outline" size={18} color={colors.primary} />
          <View style={styles.fitProfileCopy}>
            <Text style={styles.fitProfileTitle}>{nextBundle.title} 정보 채우기</Text>
            <Text style={styles.fitProfileBody}>한 묶음만 확인하고 이 공고로 바로 돌아와요.</Text>
          </View>
          <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
        </MotionPressable>
      ) : null}

      <View style={styles.fitDisclaimer}>
        <MaterialIcons name="info-outline" size={16} color={colors.textSubtle} />
        <Text style={styles.fitDisclaimerText}>{result.disclaimer}</Text>
      </View>
    </View>
  );
}

function getFitStatusView(status: ListingPersonalFitResult['status']) {
  if (status === 'good_fit') return { label: '잘 맞는 편', tone: 'green' as const };
  if (status === 'needs_information') return { label: '정보가 부족해요', tone: 'amber' as const };
  if (status === 'limited_fit') return { label: '제한적이에요', tone: 'pink' as const };
  return { label: '공고 확인 필요', tone: 'purple' as const };
}

function getCheckStatusView(status: ListingPersonalFitCheckStatus): {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
  background: string;
} {
  if (status === 'matched') {
    return { label: '확인됨', icon: 'check-circle', color: tint.green.fg, background: tint.green.bg };
  }
  if (status === 'needs_information') {
    return { label: '정보 부족', icon: 'help', color: tint.amber.fg, background: tint.amber.bg };
  }
  if (status === 'limited') {
    return { label: '제한적', icon: 'remove-circle-outline', color: tint.pink.fg, background: tint.pink.bg };
  }
  return { label: '공고 확인', icon: 'description', color: tint.purple.fg, background: tint.purple.bg };
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
  checkpoints,
  interestTags,
}: {
  checkpoints: string[];
  interestTags: string[];
}) {
  return (
    <View style={styles.tabContent}>
      <SectionHeading title="확인해야 할 조건" icon="rule" />
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
          <Text style={styles.storyTitle}>{listingName} 이야기</Text>
          <Text style={styles.storyIntro}>이 청약을 저장한 사람들이 무엇을 확인하는지 가볍게 둘러봐요.</Text>
        </View>
      </View>

      <View style={styles.readonlyNote}>
        <MaterialIcons name="lock-outline" size={17} color={colors.primary} />
        <Text style={styles.readonlyText}>지금은 읽기만 가능해요.</Text>
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
  title,
  icon,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}) {
  return (
    <View style={styles.sectionHeading}>
      <IconChip name={icon} tone="purple" />
      <Text style={styles.sectionTitle}>{title}</Text>
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
  detailName: { ...type.page, fontSize: 22, lineHeight: 30, color: colors.text, letterSpacing: tracking.tight, marginTop: 6 },
  detailAddress: { ...type.caption, color: colors.textMuted },

  fitCard: {
    gap: spacing.md,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    padding: spacing.md,
  },
  fitTop: { gap: spacing.sm },
  fitHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fitHeadingCopy: { flex: 1 },
  fitEyebrow: { ...type.micro, color: colors.primary },
  fitTitle: { ...type.section, color: colors.text },
  fitSummary: { ...type.body, color: colors.textMuted },
  fitChecks: { gap: spacing.xs },
  fitCheck: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surface,
    padding: 12,
  },
  fitCheckIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitCheckCopy: { flex: 1, gap: 3 },
  fitCheckTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fitCheckLabel: { ...type.bodySmStrong, color: colors.text, flex: 1 },
  fitCheckStatus: { ...type.micro },
  fitCheckReason: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  fitProfileButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fitProfileCopy: { flex: 1 },
  fitProfileTitle: { ...type.bodySmStrong, color: colors.primary },
  fitProfileBody: { ...type.caption, color: colors.textMuted },
  fitDisclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  fitDisclaimerText: { ...type.caption, color: colors.textSubtle, flex: 1 },

  competitionCard: {
    gap: spacing.md,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: tint.green.bg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  competitionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  competitionHeadingCopy: { flex: 1 },
  competitionEyebrow: { ...type.micro, color: tint.green.fg },
  competitionTitle: { ...type.section, color: colors.text },
  competitionStateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  competitionStateBlock: { gap: spacing.xs },
  competitionStateTitle: { ...type.bodySmStrong, color: colors.text },
  competitionStateText: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  competitionRetry: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.cardSm,
    backgroundColor: colors.lavender,
    marginTop: spacing.xs,
  },
  competitionRetryText: { ...type.label, color: colors.primary },
  competitionGroup: {
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  competitionGroupTitle: { ...type.micro, color: colors.textSubtle, paddingTop: 11, paddingBottom: 4 },
  competitionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  competitionRowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceHigh },
  competitionRowCopy: { flex: 1, gap: 2 },
  competitionRowTitle: { ...type.bodySmStrong, color: colors.text },
  competitionRowMeta: { ...type.caption, color: colors.textMuted },
  competitionRate: { ...type.bodySmStrong, ...numeric, color: tint.green.fg, textAlign: 'right' },
  competitionCalculatedNote: { ...type.caption, color: colors.textSubtle, paddingVertical: 9 },
  competitionExpand: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
  },
  competitionExpandText: { ...type.label, color: colors.primary },
  competitionPartial: { ...type.caption, color: tint.amber.fg },
  competitionSource: { ...type.caption, color: colors.textSubtle },
  competitionDisclaimer: { ...type.caption, color: colors.textMuted, lineHeight: 19 },

  factGroup: {
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 2,
  },
  factGroupLabel: { ...type.micro, color: colors.textSubtle, marginBottom: 2 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 11,
  },
  factRowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceHigh },
  factRowLabel: { ...type.bodySm, color: colors.textSubtle },
  factRowValue: { ...type.bodySmStrong, ...numeric, color: colors.text, flex: 1, textAlign: 'right', letterSpacing: tracking.normal },
  tabs: { flexDirection: 'row', gap: spacing.xs, borderRadius: radius.card, backgroundColor: colors.surfaceContainer, padding: spacing.xs },
  tabButton: { flex: 1, minHeight: size.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.cardSm },
  tabButtonActive: { backgroundColor: colors.primary, ...shadow.card },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextActive: { color: colors.onPrimary },
  tabContent: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...type.title, color: colors.text },
  sourceLinks: { gap: spacing.sm },
  sourceLink: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.primaryFixed, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  sourceLinkText: { ...type.bodyStrong, color: colors.primary, flex: 1 },
  checkpointList: { gap: spacing.sm },
  checkpointCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface, padding: 12 },
  checkpointNumber: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
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
  storyTitle: { ...type.title, color: colors.text },
  storyIntro: { ...type.body, color: colors.textMuted },
  readonlyNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: 12 },
  readonlyText: { ...type.caption, color: colors.textMuted, flex: 1 },
  storyList: { gap: spacing.sm },
  storyCard: { gap: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface, padding: spacing.md },
  storyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  avatarText: { ...type.label, color: colors.primary },
  authorCopy: { flex: 1 },
  author: { ...type.label, color: colors.text },
  storyTime: { ...type.caption, color: colors.textMuted },
  storyBody: { ...type.body, color: colors.text },
  storyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  storyLikes: { ...type.caption, color: colors.textMuted },
  demoNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: 12 },
  demoNoticeText: { ...type.caption, color: colors.textMuted, flex: 1 },
  footer: { gap: spacing.xs, paddingHorizontal: spacing.screen, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceHigh, backgroundColor: colors.surface, ...shadow.floating },
  aiLink: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  aiLinkText: { ...type.label, color: colors.primary },
  notFound: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.screen },
  notFoundTitle: { ...type.title, color: colors.text },
  notFoundBody: { ...type.body, color: colors.textMuted },
});
