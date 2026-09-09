import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import {
  buildBenchmarkExplanationContext,
  formatBenchmarkExplanationContext,
} from '../../features/benchmark/ai';
import {
  buildPeerBenchmark,
  type BenchmarkDimensionStatus,
} from '../../features/benchmark/domain';
import type { ProfileQuestionBundleId } from '../../features/profile/domain';
import { useUserStore } from '../../store/useUserStore';
import { MotionPressable } from '../motion/MotionPressable';
import { ScreenEnter } from '../motion/ScreenEnter';
import { PrimaryButton } from '../PrimaryButton';
import { ProfilePromptSheet } from '../ProfilePromptSheet';
import { ScreenHeader } from '../ScreenHeader';
import { StatusPill } from '../StatusPill';
import { WanpanCard } from '../WanpanCard';
import { PreparationAreaNav } from '../newlywed/PreparationAreaNav';

const STATUS: Record<BenchmarkDimensionStatus, {
  label: string;
  tone: React.ComponentProps<typeof StatusPill>['tone'];
}> = {
  'well-prepared': { label: '정보 확인됨', tone: 'neutral' },
  checking: { label: '확인 중', tone: 'purple' },
  'information-needed': { label: '정보 필요', tone: 'amber' },
  'listing-confirmation': { label: '공고별 확인', tone: 'neutral' },
};

export function BenchmarkDashboard() {
  const router = useRouter();
  const profile = useUserStore((state) => state.applicantProfile);
  const dismissProfileBundle = useUserStore((state) => state.dismissProfileBundle);
  const [promptBundleId, setPromptBundleId] = useState<ProfileQuestionBundleId | null>(null);
  const result = useMemo(() => buildPeerBenchmark(profile), [profile]);
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/preparation' as Href);
  const openProfile = (bundleId: ProfileQuestionBundleId) => {
    setPromptBundleId(null);
    router.push(`/profile?bundle=${bundleId}&returnTo=/benchmark` as Href);
  };
  const askAi = () => {
    const benchmark = formatBenchmarkExplanationContext(buildBenchmarkExplanationContext(result));
    router.push(`/ai?q=${encodeURIComponent('내 준비 비교 결과를 쉽게 설명해 주세요.')}&auto=1&benchmark=${encodeURIComponent(benchmark)}` as Href);
  };

  return (
    <ScreenEnter>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="내 준비 비교" onBack={goBack} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <PreparationAreaNav active="benchmark" />

            <WanpanCard tone="lavender" style={styles.hero}>
              <Text style={styles.eyebrow}>현재 내 정보 기준</Text>
              <Text style={styles.heroTitle}>{result.summary}</Text>
              <Text style={styles.heroBody}>{result.comparison.summary}</Text>
            </WanpanCard>

            {result.isSparse && result.primaryAction?.bundleId ? (
              <WanpanCard style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialIcons name="fact-check" size={22} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>가장 중요한 정보 하나부터 확인해요</Text>
                <Text style={styles.emptyBody}>미입력 정보는 낮은 준비 상태로 계산하지 않아요.</Text>
                <PrimaryButton
                  label={result.primaryAction.label}
                  onPress={() => setPromptBundleId(result.primaryAction!.bundleId!)}
                />
              </WanpanCard>
            ) : null}

            <SectionTitle
              title="내 정보 비교"
              description="점수나 순위 대신, 준비 영역별 확인 상태를 보여줘요."
            />
            <WanpanCard style={styles.cardList}>
              {result.comparison.dimensions.map((item, index) => {
                const status = STATUS[item.status];
                const actionable = item.status === 'information-needed' && item.bundleId;
                return (
                  <View key={item.id} style={[styles.dimensionRow, index > 0 && styles.rowBorder]}>
                    <View style={styles.dimensionHead}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <StatusPill label={status.label} tone={status.tone} />
                    </View>
                    <Text style={styles.rowBody}>{item.detail}</Text>
                    {actionable ? (
                      <MotionPressable
                        accessibilityRole="button"
                        onPress={() => setPromptBundleId(item.bundleId!)}
                        style={styles.textButton}
                      >
                        <Text style={styles.textButtonLabel}>부족한 정보 채우기</Text>
                        <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
                      </MotionPressable>
                    ) : null}
                  </View>
                );
              })}
            </WanpanCard>

            <SectionTitle
              title="완판e 준비 기준"
              description="서비스 내부의 정보 확인 기준이며 공식 평균이 아니에요."
            />
            <WanpanCard style={styles.sectionCard}>
              <Text style={styles.referenceSummary}>{result.reference.summary}</Text>
              <View style={styles.referenceTags}>
                {result.reference.dimensions.map((item) => (
                  <View key={item.id} style={styles.referenceTag}>
                    <Text style={styles.referenceTagText}>{item.title}</Text>
                  </View>
                ))}
              </View>
            </WanpanCard>

            <SectionTitle
              title="공식 통계"
              description="공식 공개 범위와 완판e 내부 기준을 섞지 않아요."
            />
            <WanpanCard style={styles.sectionCard}>
              <View style={styles.officialHead}>
                <View style={styles.officialIcon}>
                  <MaterialIcons name="account-balance" size={20} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{result.officialMetadata.institution}</Text>
                  <Text style={styles.officialMeta}>조회 {formatDate(result.officialMetadata.checkedAt)}</Text>
                </View>
              </View>
              <Text style={styles.officialRange}>{result.officialMetadata.dataRange}</Text>
              <Text style={styles.rowBody}>{result.official.dimensions[0].detail}</Text>
              <MotionPressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(result.officialMetadata.sourceUrl)}
                style={styles.sourceLink}
              >
                <Text style={styles.sourceLinkText}>공공데이터포털 원문 보기</Text>
                <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
              </MotionPressable>
            </WanpanCard>

            <View style={styles.primaryWrap}>
              <PrimaryButton label="AI에게 비교 결과 설명 듣기" icon="auto-awesome" onPress={askAi} />
            </View>
            <View style={styles.disclaimer}>
              <MaterialIcons name="info-outline" size={16} color={colors.textMuted} />
              <Text style={styles.disclaimerText}>{result.disclaimer}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <ProfilePromptSheet
        bundleId={promptBundleId}
        onEdit={openProfile}
        onLater={(bundleId) => {
          dismissProfileBundle(bundleId);
          setPromptBundleId(null);
        }}
      />
    </ScreenEnter>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
  );
}

function formatDate(value: string): string {
  return value.replaceAll('-', '.');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 80 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.md },
  hero: { marginHorizontal: spacing.screen, marginTop: spacing.sm },
  eyebrow: { ...type.label, color: colors.primary },
  heroTitle: { ...type.title, color: colors.text, marginTop: spacing.xs },
  heroBody: { ...type.bodySm, color: colors.textMuted, marginTop: spacing.sm },
  emptyCard: { marginHorizontal: spacing.screen, gap: spacing.sm },
  emptyIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  emptyTitle: { ...type.cardTitle, color: colors.text },
  emptyBody: { ...type.bodySm, color: colors.textMuted, marginBottom: spacing.xs },
  sectionTitle: { marginHorizontal: spacing.screen, marginTop: spacing.md },
  sectionText: { ...type.section, color: colors.text },
  sectionDescription: { ...type.caption, color: colors.textSubtle, marginTop: 2 },
  cardList: { marginHorizontal: spacing.screen, paddingVertical: 0 },
  sectionCard: { marginHorizontal: spacing.screen },
  dimensionRow: { minHeight: 96, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dimensionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  rowTitle: { ...type.rowTitle, color: colors.text },
  rowBody: { ...type.bodySm, color: colors.textMuted, marginTop: spacing.xs },
  textButton: { minHeight: size.touch, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  textButtonLabel: { ...type.label, color: colors.primary },
  referenceSummary: { ...type.bodySm, color: colors.textMuted },
  referenceTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  referenceTag: { minHeight: 30, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceContainer, paddingHorizontal: 10 },
  referenceTagText: { ...type.caption, color: colors.textMuted },
  officialHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  officialIcon: { width: 40, height: 40, borderRadius: radius.cardSm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  officialMeta: { ...type.caption, color: colors.textSubtle, marginTop: 1 },
  officialRange: { ...type.bodySmStrong, color: colors.primary, marginTop: spacing.md },
  sourceLink: { minHeight: size.touch, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  sourceLinkText: { ...type.label, color: colors.primary },
  primaryWrap: { marginHorizontal: spacing.screen },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.screen },
  disclaimerText: { ...type.caption, color: colors.textMuted, flex: 1 },
  flex: { flex: 1 },
});
