import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { stagger, travel } from '../../design/motion';
import { colors, numeric, spacing, tracking, type } from '../../design/tokens';
import { getDdayLabel, getKoreanToday, parseDateOnly } from '../../features/calendar/domain';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';
import { buildNewlywedDashboard, type NewlywedChecklistStatus } from '../../features/newlywed/domain';
import { useUserStore } from '../../store/useUserStore';
import { Appear } from '../motion/Appear';
import { MotionPressable } from '../motion/MotionPressable';
import { ScreenEnter } from '../motion/ScreenEnter';
import { PrimaryButton } from '../PrimaryButton';
import { ScreenHeader } from '../ScreenHeader';
import { StatusPill } from '../StatusPill';
import { WanpanCard } from '../WanpanCard';
import { PreparationAreaNav } from './PreparationAreaNav';

const CHECK_STATUS: Record<NewlywedChecklistStatus, { label: string; tone: React.ComponentProps<typeof StatusPill>['tone'] }> = {
  confirmed: { label: '정보 확인 완료', tone: 'neutral' },
  'information-needed': { label: '정보 필요', tone: 'amber' },
  'notice-check': { label: '공고별 확인 필요', tone: 'purple' },
};

export function NewlywedDashboard() {
  const router = useRouter();
  const profile = useUserStore((state) => state.applicantProfile);
  const dataset = useListingDataset();
  const today = getKoreanToday();
  const model = useMemo(
    () => buildNewlywedDashboard(profile, dataset.listings, today),
    [dataset.listings, profile, today],
  );
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/preparation' as Href);

  return (
    <ScreenEnter>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="신혼 청약 관리" onBack={goBack} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <PreparationAreaNav active="newlywed" />

          <Appear delay={stagger.short} distance={travel.content}>
          <WanpanCard tone="lavender" style={styles.hero}>
            <Text style={styles.eyebrow}>신혼 청약 준비 현황</Text>
            {/* 관리 화면이라 '어디까지 왔는지'가 먼저 보여야 한다.
                숫자를 문장에 묻지 않고 눈금으로 세운다. */}
            <View style={styles.meterRow}>
              <Text style={styles.meterValue}>{model.confirmedCount}</Text>
              <Text style={styles.meterTotal}>/ {model.informationItemCount}</Text>
              <Text style={styles.meterUnit}>개 정보 영역 확인</Text>
            </View>
            <View style={styles.meterTrack} accessibilityRole="progressbar">
              {Array.from({ length: model.informationItemCount }, (_, i) => (
                <View
                  key={i}
                  style={[styles.meterTick, i < model.confirmedCount && styles.meterTickOn]}
                />
              ))}
            </View>
            <Text style={styles.heroBody}>이 수치는 자격 점수가 아니라 프로필 정보 확인 현황이에요. 실제 신청 조건은 공고문 기준으로 확인해야 해요.</Text>
            <View style={styles.heroAction}>
              <PrimaryButton label="내 신혼 청약 조건 보기" onPress={() => router.push('/eligibility/newlywed' as Href)} />
            </View>
          </WanpanCard>
          </Appear>

          <SectionTitle title="조건별 준비 상황" description="저장된 정보의 확인 여부만 표시해요. 자격 판정이 아니에요." />
          <WanpanCard style={styles.cardList}>
            {model.checklist.map((item, index) => {
              const status = CHECK_STATUS[item.status];
              return (
                <View key={item.id} style={[styles.checkRow, index > 0 && styles.rowBorder]}>
                  <View style={styles.flex}>
                    <View style={styles.checkHead}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <StatusPill label={status.label} tone={status.tone} />
                    </View>
                    <Text style={styles.rowBody}>{item.detail}</Text>
                    {item.status === 'information-needed' && item.bundleId ? (
                      <MotionPressable
                        accessibilityRole="button"
                        onPress={() => router.push(`/profile?bundle=${item.bundleId}&returnTo=/newlywed` as Href)}
                        style={styles.textButton}
                      >
                        <Text style={styles.textButtonLabel}>프로필에서 입력</Text>
                        <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
                      </MotionPressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </WanpanCard>

          <SectionTitle title="관련 공고" description="청약홈에 공식 특별공급 접수 일정이 있는 공고예요." />
          {dataset.status === 'loading' ? (
            <StateView loading label="공고를 불러오는 중이에요." />
          ) : dataset.status === 'error' ? (
            <StateView label="공고를 불러오지 못했어요." action={() => void dataset.retry()} />
          ) : model.relatedListings.length === 0 ? (
            <StateView label="현재 데이터에서 공식 특별공급 일정을 확인할 공고가 없어요." />
          ) : (
            <WanpanCard style={styles.cardList}>
              {model.relatedListings.slice(0, 5).map((item, index) => (
                <MotionPressable
                  key={item.listing.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/discovery/${item.listing.id}` as Href)}
                  style={[styles.listingRow, index > 0 && styles.rowBorder]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{item.listing.complexName}</Text>
                    <View style={styles.metaRow}>
                      <StatusPill label="공식 특별공급 일정" tone="purple" />
                      {item.preferenceMatch ? <StatusPill label="관심지역" tone="green" /> : null}
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
                </MotionPressable>
              ))}
            </WanpanCard>
          )}
          <Text style={styles.disclaimer}>특별공급 일정이 있다는 사실만으로 신혼부부 공급 대상 또는 신청 자격을 뜻하지 않아요. 공식 모집공고문에서 공급 유형과 조건을 확인해 주세요.</Text>

          <View style={styles.sectionHeadAction}>
            <SectionTitle title="다가오는 일정" description="같은 청약 캘린더 데이터를 사용해요." compact />
            <MotionPressable accessibilityRole="button" onPress={() => router.push('/calendar' as Href)} style={styles.calendarLink}>
              <Text style={styles.calendarLinkText}>전체 일정</Text>
              <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
            </MotionPressable>
          </View>
          {model.upcomingEvents.length === 0 ? (
            <StateView label="현재 확인할 수 있는 다가오는 특별공급 일정이 없어요." />
          ) : (
            <WanpanCard style={styles.cardList}>
              {model.upcomingEvents.slice(0, 4).map((event, index) => (
                <MotionPressable
                  key={event.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/discovery/${event.listingId}` as Href)}
                  style={[styles.scheduleRow, index > 0 && styles.rowBorder]}
                >
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateText}>{formatEventDate(event.date)}</Text>
                    <Text style={styles.dday}>{getDdayLabel(event.date, today)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{event.listingName}</Text>
                    <Text style={styles.rowBody}>{event.label}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
                </MotionPressable>
              ))}
            </WanpanCard>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
    </ScreenEnter>
  );
}

function SectionTitle({ title, description, compact }: { title: string; description: string; compact?: boolean }) {
  return <View style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}><Text style={styles.sectionText}>{title}</Text><Text style={styles.sectionDescription}>{description}</Text></View>;
}

function StateView({ label, loading, action }: { label: string; loading?: boolean; action?: () => void }) {
  return (
    <WanpanCard style={styles.stateCard}>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={styles.stateText}>{label}</Text>
      {action ? <PrimaryButton label="다시 시도" variant="soft" onPress={action} /> : null}
    </WanpanCard>
  );
}

function formatEventDate(date: string): string {
  const parts = parseDateOnly(date);
  return parts ? `${parts.month}.${parts.day.toString().padStart(2, '0')}` : date;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 80 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: { marginHorizontal: spacing.screen, marginTop: spacing.lg },
  eyebrow: { ...type.label, color: colors.primary },
  heroTitle: { ...type.title, color: colors.text, marginTop: spacing.xs },
  meterRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: spacing.xs },
  meterValue: { ...type.metric, ...numeric, color: colors.primary, letterSpacing: tracking.display },
  meterTotal: { ...type.title, ...numeric, color: colors.textSubtle },
  meterUnit: { ...type.bodySm, color: colors.textMuted },
  /** 영역 수만큼 눈금을 두어 '몇 칸 남았는지'가 바로 보이게 한다. */
  meterTrack: { flexDirection: 'row', gap: 3, marginTop: spacing.sm },
  meterTick: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.primaryFixed },
  meterTickOn: { backgroundColor: colors.primary },
  heroBody: { ...type.bodySm, color: colors.textMuted, marginTop: spacing.sm },
  /** 설명 문단과 CTA 가 붙어 있으면 버튼이 문장의 일부처럼 보인다. */
  heroAction: { marginTop: spacing.md },
  sectionTitle: { marginHorizontal: spacing.screen, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitleCompact: { marginHorizontal: 0, flex: 1 },
  sectionText: { ...type.section, color: colors.text },
  sectionDescription: { ...type.caption, color: colors.textSubtle, marginTop: 2 },
  cardList: { marginHorizontal: spacing.screen, paddingVertical: 0 },
  checkRow: { minHeight: 96, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  checkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  rowTitle: { ...type.rowTitle, color: colors.text },
  rowBody: { ...type.bodySm, color: colors.textMuted, marginTop: spacing.xs },
  textButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  textButtonLabel: { ...type.label, color: colors.primary },
  listingRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  disclaimer: { ...type.caption, color: colors.textMuted, marginHorizontal: spacing.screen, marginTop: spacing.sm },
  sectionHeadAction: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginHorizontal: spacing.screen },
  calendarLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  calendarLinkText: { ...type.label, color: colors.primary },
  scheduleRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  dateBlock: { width: 52 },
  dateText: { ...type.bodySmStrong, color: colors.text },
  dday: { ...type.caption, color: colors.primary, marginTop: 2 },
  stateCard: { minHeight: 112, marginHorizontal: spacing.screen, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stateText: { ...type.bodySm, color: colors.textMuted, textAlign: 'center' },
});
