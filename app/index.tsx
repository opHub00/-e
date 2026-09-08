import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BackButton } from '../components/BackButton';
import { Appear } from '../components/motion/Appear';
import { MotionPressable } from '../components/motion/MotionPressable';
import { ScreenEnter } from '../components/motion/ScreenEnter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { BrandMark } from '../components/BrandMark';
import { colors, radius, size, spacing, tint, type } from '../design/tokens';
import { LIMITS, validateNumberField } from '../domain/preparation';
import type { FieldIssue } from '../domain/preparation';
import { createMinimalApplicantProfile } from '../features/profile/domain';
import { getRegionLabel, PROFILE_REGIONS } from '../features/discovery/regions';
import { defaultProfile, shouldRedirectToIntro, useUserStore } from '../store/useUserStore';

/** 숫자 입력은 편집 중 빈 문자열을 허용해야 해서 문자열로 들고 있는다. */
type Draft = {
  name: string;
  age: string;
  currentRegion: string;
  preferredRegions: string[];
};

const toDraft = (): Draft => ({
  name: defaultProfile.name,
  age: String(defaultProfile.age),
  currentRegion: defaultProfile.region,
  preferredRegions: [defaultProfile.region],
});

const digits = (v: string) => v.replace(/[^0-9]/g, '');
const num = (v: string) => Number(v) || 0;

const ISSUE_TEXT: Record<FieldIssue, (limit: { min: number; max: number }, unit: string) => string> =
  {
    empty: () => '값을 입력해 주세요.',
    nan: () => '숫자만 입력해 주세요.',
    range: (limit, unit) =>
      `${limit.min.toLocaleString('ko-KR')}${unit} ~ ${limit.max.toLocaleString('ko-KR')}${unit} 사이로 입력해 주세요.`,
  };

/** empty / nan / range 를 구분해 안내 문구로 바꾼다. */
function fieldError(raw: string, limit: { min: number; max: number }, unit: string) {
  const issue = validateNumberField(raw, limit);
  return issue ? ISSUE_TEXT[issue](limit, unit) : null;
}

type Step = 'intro' | 'basic';

const VALUE_ROWS = [
  {
    icon: 'speed' as const,
    tone: 'purple' as const,
    title: '지금 내 준비도',
    body: '통장·무주택·납입을 한 점수로',
  },
  {
    icon: 'trending-up' as const,
    tone: 'amber' as const,
    title: '시간이 만드는 변화',
    body: '1·2·5년 뒤 내 상태를 미리',
  },
  {
    icon: 'school' as const,
    tone: 'green' as const,
    title: '하루 30초 학습',
    body: '어려운 용어를 내 상황으로',
  },
];

export default function OnboardingRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setApplicantProfile = useUserStore((s) => s.setApplicantProfile);
  const hasSeenIntro = useUserStore((s) => s.hasSeenIntro);
  const introHydrated = useUserStore((s) => s.introHydrated);
  const hydrateIntro = useUserStore((s) => s.hydrateIntro);
  // intro 를 막 마친 사용자는 브랜드 소개를 반복하지 않고 바로 입력으로 간다.
  const params = useLocalSearchParams<{ step?: string }>();
  const [step, setStep] = useState<Step>(params.step === 'basic' ? 'basic' : 'intro');
  const [draft, setDraft] = useState<Draft>(toDraft);

  useEffect(() => {
    void hydrateIntro();
  }, [hydrateIntro]);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  const errors = {
    age: fieldError(draft.age, LIMITS.age, '세'),
  };
  const basicInvalid = Boolean(
    errors.age || !draft.currentRegion.trim() || draft.preferredRegions.length === 0,
  );

  const submit = () => {
    if (basicInvalid) return;
    setApplicantProfile(
      createMinimalApplicantProfile({
        name: draft.name,
        age: num(draft.age),
        currentRegion: draft.currentRegion,
        preferredRegions: draft.preferredRegions,
      }),
    );
    router.replace('/home');
  };

  if (!introHydrated) return null;
  if (shouldRedirectToIntro({ hasSeenIntro, introHydrated })) return <Redirect href="/intro" />;

  /* ── 1. Brand introduction ── */
  if (step === 'intro') {
    return (
      <ScreenEnter style={styles.screen}>
        <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[colors.primaryContainer, colors.primary]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.introBand, { paddingTop: Math.max(insets.top, 12) + 14 }]}
          >
            <View style={styles.glowA} />
            <View style={styles.glowB} />

            <View style={styles.introBrand}>
              <BrandMark size={32} />
              <Text style={styles.introWordmark}>완판e</Text>
            </View>

            <Text style={styles.introTitle}>
              청약은{'\n'}
              <Text style={styles.introTitleAccent}>신청할 때가 아니라</Text>
              {'\n'}준비할 때부터
            </Text>
            <Text style={styles.introBody}>
              자격 판정 대신, 지금 쌓이는 준비와 다음 변화를 보여드려요.
            </Text>

            <View style={styles.introReassurance}>
              <Text style={styles.introReassuranceText}>
                아직 청약 계획이 없어도 괜찮아요
              </Text>
            </View>
          </LinearGradient>

          <View style={styles.introSheet}>
            <Text style={styles.introSheetHead}>완판e가 하는 일</Text>
            {VALUE_ROWS.map((row, index) => (
              <View key={row.title} style={[styles.valueRow, index > 0 && styles.valueRowDivider]}>
                <View style={[styles.valueIcon, { backgroundColor: tint[row.tone].bg }]}>
                  <MaterialIcons name={row.icon} size={18} color={tint[row.tone].fg} />
                </View>
                <View style={styles.valueCopy}>
                  <Text style={styles.valueTitle}>{row.title}</Text>
                  <Text style={styles.valueBody}>{row.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.introFooter, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
          <Text style={styles.introFootNote}>1분이면 끝나요 · 자격 판정은 하지 않아요</Text>
          <MotionPressable
            accessibilityRole="button"
            onPress={() => setStep('basic')}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>내 준비 시작하기</Text>
            <MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />
          </MotionPressable>
        </View>
      </ScreenEnter>
    );
  }

  /* ── 2. Guided setup ── */
  const blocked = basicInvalid;

  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.setupHead, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.setupTopRow}>
          <BackButton onPress={() => setStep('intro')} accessibilityLabel="이전" />
          <Text style={styles.stepCount}>STEP 1 / 1</Text>
          <View style={styles.backButtonGhost} />
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.setupScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.stepBanner, { backgroundColor: colors.lavender }]}>
            <View
              style={[styles.stepBannerIcon, { backgroundColor: colors.primaryFixed }]}
            >
              <MaterialIcons
                name="person"
                size={19}
                color={colors.primary}
              />
            </View>
            <View style={styles.stepBannerCopy}>
              <Text style={[styles.stepBannerTitle, { color: colors.primary }]}>지금의 나</Text>
              <Text style={styles.stepBannerBody}>
                지금은 꼭 필요한 정보만 받고, 나머지는 사용할 때 물어볼게요
              </Text>
            </View>
          </View>

          <Appear replayKey="setup-basic" style={styles.fields}>
            <Field label="이름 또는 닉네임">
              <TextInput
                style={styles.input}
                value={draft.name}
                onChangeText={(name) => patch({ name })}
                placeholder="지민"
                placeholderTextColor={colors.outline}
              />
            </Field>

            <Field label="나이" error={errors.age}>
              <TextInput
                style={[styles.input, errors.age && styles.inputError]}
                value={draft.age}
                onChangeText={(v) => patch({ age: digits(v) })}
                keyboardType="number-pad"
                maxLength={3}
              />
            </Field>

            <Field label="현재 거주지역">
              <View style={styles.chipRow}>
                {PROFILE_REGIONS.map((region) => (
                  <Chip
                    key={region}
                    label={getRegionLabel(region)}
                    active={draft.currentRegion === region}
                    onPress={() => patch({ currentRegion: region })}
                  />
                ))}
              </View>
            </Field>

            <Field label="관심지역 · 여러 곳 선택 가능">
              <View style={styles.chipRow}>
                {PROFILE_REGIONS.map((region) => {
                  const active = draft.preferredRegions.includes(region);
                  return (
                    <Chip
                      key={region}
                      label={getRegionLabel(region)}
                      active={active}
                      onPress={() =>
                        patch({
                          preferredRegions: active
                            ? draft.preferredRegions.filter((item) => item !== region)
                            : [...draft.preferredRegions, region],
                        })
                      }
                    />
                  );
                })}
              </View>
            </Field>
          </Appear>
        </ScrollView>

        <View style={[styles.setupFooter, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
          <MotionPressable
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            disabled={blocked}
            onPress={submit}
          style={[
            styles.cta,
            blocked && styles.ctaDisabled,
          ]}
          >
            <Text style={styles.ctaText}>완판e 시작하기</Text>
            <MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />
          </MotionPressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenEnter>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </MotionPressable>
  );
}

const SIDE = spacing.screen;

const styles = StyleSheet.create({
  screen: { flex: 1, height: '100%', backgroundColor: colors.surface },
  flex: { flex: 1 },

  /* ── Onboarding ── */
  introScroll: { flexGrow: 1, paddingBottom: 0 },
  introBand: { paddingHorizontal: SIDE, paddingBottom: 26, overflow: 'hidden' },
  glowA: {
    pointerEvents: 'none',
    position: 'absolute',
    right: -70,
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  glowB: {
    pointerEvents: 'none',
    position: 'absolute',
    left: -50,
    bottom: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  introBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introWordmark: {
    ...type.title,
    fontSize: 21,
    lineHeight: 27,
    color: colors.onPrimary,
    letterSpacing: -0.5,
  },
  introTitle: {
    fontFamily: type.metric.fontFamily,
    fontSize: 30,
    lineHeight: 42,
    color: colors.onPrimary,
    letterSpacing: -0.9,
    marginTop: 26,
  },
  introTitleAccent: { color: colors.primaryFixed },
  introBody: { ...type.bodySm, color: 'rgba(255,255,255,0.78)', marginTop: 12, lineHeight: 22 },

  introReassurance: {
    alignSelf: 'stretch',
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 22,
  },
  introReassuranceText: { ...type.bodySmStrong, color: colors.onPrimary, letterSpacing: -0.2 },

  introSheet: {
    flex: 1,
    marginTop: -16,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SIDE,
    paddingTop: 20,
  },
  introSheetHead: { ...type.label, color: colors.textMuted, letterSpacing: 0.2, marginBottom: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  valueRowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  valueIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueCopy: { flex: 1, gap: 2 },
  valueTitle: { ...type.bodySmStrong, fontSize: 15, color: colors.text, letterSpacing: -0.3 },
  valueBody: { ...type.caption, color: colors.textSubtle },

  introFooter: {
    paddingHorizontal: SIDE,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.surface,
  },
  introFootNote: { ...type.caption, color: colors.textSubtle, textAlign: 'center' },

  /* ── Guided setup ── */
  setupHead: {
    paddingHorizontal: SIDE,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: colors.surface,
  },
  setupTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButtonGhost: { width: size.iconButton },
  stepCount: { ...type.micro, color: colors.textSubtle, letterSpacing: 1.2 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },

  setupScroll: { paddingHorizontal: SIDE, paddingTop: 16, paddingBottom: 24, gap: 20 },
  stepBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  stepBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBannerCopy: { flex: 1, gap: 2 },
  stepBannerTitle: { ...type.cardTitle, letterSpacing: -0.3 },
  stepBannerBody: { ...type.caption, color: colors.textMuted },

  fields: { gap: 18 },
  field: { gap: 7 },
  fieldLabel: { ...type.bodySmStrong, color: colors.text, letterSpacing: -0.2 },
  input: {
    ...type.bodyLg,
    minHeight: size.control,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceLow,
    paddingHorizontal: 14,
    color: colors.text,
  },
  inputError: { borderColor: colors.error, backgroundColor: colors.surface },
  fieldError: { ...type.caption, color: colors.error },

  chipRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  chip: {
    minHeight: size.touch,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surfaceLow,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.bodySmStrong, color: colors.textMuted },
  chipTextActive: { color: colors.onPrimary },

  setupFooter: {
    paddingHorizontal: SIDE,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },

  /* Toss: xlarge 터치 액션. 상태(pressed/disabled) 를 유지한다. */
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: size.control,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  ctaDisabled: { backgroundColor: colors.outline },
  ctaText: { ...type.bodyLgStrong, color: colors.onPrimary, letterSpacing: -0.3 },
});
