import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../PrimaryButton';
import { ScreenHeader } from '../ScreenHeader';
import { WanpanCard } from '../WanpanCard';
import { MotionPressable } from '../motion/MotionPressable';
import { colors, radius, spacing, type } from '../../design/tokens';
import { useCalendar } from '../../features/calendar/useCalendar';
import { useListingDataset } from '../../features/discovery/data/useListingDataset';
import { useDiscoveryStore } from '../../features/discovery/useDiscoveryStore';
import { CalendarAgenda } from './CalendarAgenda';
import { CalendarMonth } from './CalendarMonth';

export function CalendarScreen() {
  const router = useRouter();
  const dataset = useListingDataset();
  const savedListingIds = useDiscoveryStore((state) => state.savedListingIds);
  const calendar = useCalendar(dataset.listings, savedListingIds);
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/preparation' as Href);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="청약 캘린더" onBack={goBack} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.intro}>공식 공고에 공개된 접수·발표·계약 일정을 월별로 확인해요.</Text>
          <View style={styles.filters}>
            {(['all', 'saved'] as const).map((mode) => {
              const selected = calendar.filter === mode;
              return (
                <MotionPressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => calendar.setFilter(mode)}
                  style={[styles.filter, selected && styles.filterSelected]}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{mode === 'all' ? '전체 일정' : '관심 일정'}</Text>
                </MotionPressable>
              );
            })}
          </View>

          {dataset.status === 'loading' ? (
            <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>일정을 불러오는 중이에요.</Text></View>
          ) : dataset.status === 'error' ? (
            <View style={styles.state}><Text style={styles.stateText}>일정을 불러오지 못했어요.</Text><PrimaryButton label="다시 시도" variant="soft" onPress={() => void dataset.retry()} /></View>
          ) : (
            <>
              {dataset.isFallback ? <Text style={styles.notice}>현재는 예시 공고 일정이 표시되고 있어요.</Text> : null}
              <WanpanCard>
                <CalendarMonth
                  monthId={calendar.monthId}
                  days={calendar.days}
                  selectedDate={calendar.selectedDate}
                  eventCounts={calendar.eventCounts}
                  onPrevious={() => calendar.changeMonth(-1)}
                  onNext={() => calendar.changeMonth(1)}
                  onToday={calendar.goToday}
                  onSelect={calendar.selectDate}
                />
                <CalendarAgenda
                  date={calendar.selectedDate}
                  today={calendar.today}
                  events={calendar.selectedEvents}
                  onOpenListing={(listingId) => router.push(`/discovery/${listingId}` as Href)}
                />
              </WanpanCard>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 64 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.screen },
  intro: { ...type.body, color: colors.textMuted, marginBottom: spacing.md },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filter: { minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceContainer, paddingHorizontal: spacing.md },
  filterSelected: { backgroundColor: colors.primaryFixed },
  filterText: { ...type.label, color: colors.textMuted },
  filterTextSelected: { color: colors.primary },
  notice: { ...type.caption, color: colors.warning, marginBottom: spacing.sm },
  state: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
