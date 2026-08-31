import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { colors, radius, spacing, tint, type } from '../../design/tokens';
import { useUserStore } from '../../store/useUserStore';

type CategoryName = '내 청약' | '청약 찾기' | '준비하기' | '배우기' | '상담';

type FeatureItem = {
  category: CategoryName;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  tone: keyof typeof tint;
  route: Href;
  keywords: string[];
};

const CATEGORY_ORDER: CategoryName[] = ['내 청약', '청약 찾기', '준비하기', '배우기', '상담'];

const FEATURES: FeatureItem[] = [
  {
    category: '내 청약',
    title: '내 청약 프로필',
    description: '입력한 정보와 더 확인할 항목을 관리해요',
    icon: 'badge',
    tone: 'purple',
    route: '/profile' as Href,
    keywords: ['프로필', '청약 여권', '정보', '완성도', '수정'],
  },
  {
    category: '내 청약',
    title: '나의 대시보드',
    description: '준비도와 오늘 상태를 한눈에 봐요',
    icon: 'dashboard',
    tone: 'purple',
    route: '/home' as Href,
    keywords: ['홈', '준비도', '현재 단계', '오늘 할 일'],
  },
  {
    category: '내 청약',
    title: '저장한 청약',
    description: '관심 청약을 청약찾기에서 이어봐요',
    icon: 'bookmark',
    tone: 'green',
    route: '/discovery' as Href,
    keywords: ['저장', '관심', '단지'],
  },
  {
    category: '청약 찾기',
    title: '청약찾기',
    description: '실제 청약 공고를 목록과 지도에서 살펴봐요',
    icon: 'travel-explore',
    tone: 'purple',
    route: '/discovery' as Href,
    keywords: ['지도', '목록', '모집중', '모집예정', '지역', '공급 유형'],
  },
  {
    category: '준비하기',
    title: '준비 대시보드',
    description: '미래와 학습을 한곳에서 이어가요',
    icon: 'insights',
    tone: 'green',
    route: '/preparation' as Href,
    keywords: ['준비', '준비도', '오늘 할 일', '또래'],
  },
  {
    category: '준비하기',
    title: '미래의 나',
    description: '시간이 쌓인 뒤 준비 변화를 살펴봐요',
    icon: 'calendar-month',
    tone: 'purple',
    route: '/future' as Href,
    keywords: ['미래', '1년', '2년', '5년', '시뮬레이션'],
  },
  {
    category: '배우기',
    title: '오늘의 30초 퀴즈',
    description: '매일 한 문제로 청약 감각을 쌓아요',
    icon: 'quiz',
    tone: 'amber',
    route: '/quiz' as Href,
    keywords: ['퀴즈', '학습', '문제', 'XP'],
  },
  {
    category: '상담',
    title: '완판e AI',
    description: '내 상태를 바탕으로 쉬운 설명을 들어요',
    icon: 'auto-awesome',
    tone: 'purple',
    route: '/ai' as Href,
    keywords: ['AI', '설명', '질문', '상담'],
  },
];

export default function MoreRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const resetDemo = useUserStore((state) => state.resetDemo);
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const visibleFeatures = useMemo(
    () =>
      normalizedQuery
        ? FEATURES.filter((feature) =>
            [feature.title, feature.description, feature.category, ...feature.keywords]
              .join(' ')
              .toLocaleLowerCase('ko-KR')
              .includes(normalizedQuery),
          )
        : FEATURES,
    [normalizedQuery],
  );

  const restart = async () => {
    await resetDemo();
    router.replace('/');
  };

  return (
    <View style={styles.screen}>
      {/* Airbnb Help: 유틸리티 화면은 검색이 최상단, 그 아래는 divider 행. */}
      <View style={[styles.head, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.headRow}>
          <BrandMark size={22} />
          <Text style={styles.headTitle}>전체</Text>
          <View style={styles.spacer} />
          <MotionPressable
            accessibilityRole="button"
            onPress={restart}
            style={styles.resetChip}
          >
            <MaterialIcons name="restart-alt" size={14} color={colors.textMuted} />
            <Text style={styles.resetChipText}>데모 초기화</Text>
          </MotionPressable>
        </View>

        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={19} color={colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="기능 검색 · 청약찾기, 미래, 퀴즈, AI"
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              onPress={() => setQuery('')}
              hitSlop={8}
            >
              <MaterialIcons name="cancel" size={17} color={colors.outline} />
            </MotionPressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {normalizedQuery && visibleFeatures.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>찾는 기능이 없어요</Text>
            <Text style={styles.emptyBody}>다른 이름으로 검색해보세요.</Text>
          </View>
        ) : null}

        {CATEGORY_ORDER.map((category) => {
          const items = visibleFeatures.filter((feature) => feature.category === category);
          if (items.length === 0) return null;
          return (
            <View key={category} style={styles.section}>
              <Text style={styles.sectionLabel}>{category}</Text>
              {items.map((feature, index) => (
                <MotionPressable
                  key={feature.title}
                  accessibilityRole="button"
                  onPress={() => router.push(feature.route)}
                  style={[
                    styles.row,
                    index > 0 && styles.rowDivider,
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: tint[feature.tone].bg }]}>
                    <MaterialIcons name={feature.icon} size={17} color={tint[feature.tone].fg} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{feature.title}</Text>
                    <Text style={styles.rowBody} numberOfLines={1}>
                      {feature.description}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={19} color={colors.outline} />
                </MotionPressable>
              ))}
            </View>
          );
        })}

        <Text style={styles.footNote}>
          지금 이동할 수 있는 기능만 보여드려요. 준비 중인 기능은 담지 않았어요.
        </Text>
      </ScrollView>
    </View>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  screen: { flex: 1, height: '100%', backgroundColor: colors.surface },
  spacer: { flex: 1 },

  head: {
    paddingHorizontal: SIDE,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headTitle: { ...type.bodyLgStrong, color: colors.text, letterSpacing: -0.3 },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 10,
  },
  resetChipText: { ...type.micro, color: colors.textMuted },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 15,
  },
  searchInput: { ...type.bodySm, flex: 1, color: colors.text, padding: 0 },

  scroll: { paddingBottom: 88 },

  section: { paddingHorizontal: SIDE, paddingTop: 18 },
  sectionLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: 1, marginBottom: 2 },

  /* Airbnb Help list row: 카드가 아니라 divider 로 나뉜 행. */
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...type.bodySmStrong, fontSize: 15, color: colors.text, letterSpacing: -0.3 },
  rowBody: { ...type.caption, color: colors.textSubtle },

  empty: { paddingHorizontal: SIDE, paddingTop: 28, gap: 4 },
  emptyTitle: { ...type.cardTitle, color: colors.text },
  emptyBody: { ...type.bodySm, color: colors.textSubtle },

  footNote: { ...type.caption, color: colors.textSubtle, paddingHorizontal: SIDE, paddingTop: 26 },
});
