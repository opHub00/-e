import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedBar } from '../components/motion/AnimatedBar';
import { Appear } from '../components/motion/Appear';
import { MotionPressable } from '../components/motion/MotionPressable';
import { ScreenEnter } from '../components/motion/ScreenEnter';
import { colors, radius, shadow, size, spacing, tint, type } from '../design/tokens';
import type { Occupation } from '../domain/types';
import {
  PROFILE_BUNDLES,
  calculateProfileCompleteness,
  getBundleCompletion,
  knownField,
  knownValue,
  notApplicableField,
  unknownField,
  type AmountRange,
  type ApplicantProfileV2,
  type IncomeRange,
  type ProfileFieldState,
  type ProfileQuestionBundleId,
} from '../features/profile/domain';
import { useUserStore } from '../store/useUserStore';

const REGIONS = ['서울특별시', '경기도', '인천광역시'];
const OCCUPATIONS: Array<{ value: Occupation; label: string }> = [
  { value: 'student', label: '학생' },
  { value: 'worker', label: '직장인' },
  { value: 'etc', label: '그 외' },
];
const AMOUNT_RANGES: Array<{ value: AmountRange; label: string }> = [
  { value: 'under-10m', label: '1,000만원 미만' },
  { value: '10m-30m', label: '1,000~3,000만원' },
  { value: '30m-50m', label: '3,000~5,000만원' },
  { value: '50m-100m', label: '5,000만원~1억원' },
  { value: 'over-100m', label: '1억원 이상' },
];
const INCOME_RANGES: Array<{ value: IncomeRange; label: string }> = [
  { value: 'under-30m', label: '3,000만원 미만' },
  { value: '30m-50m', label: '3,000~5,000만원' },
  { value: '50m-70m', label: '5,000~7,000만원' },
  { value: '70m-100m', label: '7,000만원~1억원' },
  { value: 'over-100m', label: '1억원 이상' },
];

const BUNDLE_ICONS: Record<ProfileQuestionBundleId, React.ComponentProps<typeof MaterialIcons>['name']> = {
  BASIC: 'person',
  RESIDENCE: 'location-on',
  SUBSCRIPTION_ACCOUNT: 'account-balance-wallet',
  HOUSING_HISTORY: 'holiday-village',
  HOUSEHOLD: 'groups',
  FAMILY: 'family-restroom',
  INCOME: 'payments',
  ASSETS: 'savings',
  PREFERENCES: 'favorite',
};

export default function ApplicantProfileRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bundle?: string; returnTo?: string }>();
  const applicantProfile = useUserStore((state) => state.applicantProfile);
  const setApplicantProfile = useUserStore((state) => state.setApplicantProfile);
  const bundleId = isBundleId(params.bundle) ? params.bundle : null;
  const [draft, setDraft] = useState(applicantProfile);

  useEffect(() => setDraft(applicantProfile), [applicantProfile, bundleId]);

  const bundle = PROFILE_BUNDLES.find((item) => item.id === bundleId);
  const close = () => {
    if (params.returnTo) router.replace(params.returnTo as Href);
    else if (router.canGoBack()) router.back();
    else router.replace('/more');
  };
  const save = () => {
    setApplicantProfile(draft);
    if (params.returnTo) router.replace(params.returnTo as Href);
    else router.replace('/profile' as Href);
  };

  if (!bundle || !bundleId) {
    return <ProfileOverview profile={applicantProfile} topInset={insets.top} onBack={close} onOpen={(id) => router.push(`/profile?bundle=${id}` as Href)} />;
  }

  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <MotionPressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={close} style={styles.back}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </MotionPressable>
        <Text style={styles.headerTitle}>{bundle.title}</Text>
        <View style={styles.backGhost} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.editorScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.reasonCard}>
            <View style={styles.reasonIcon}>
              <MaterialIcons name="help-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.reasonTitle}>왜 필요한가요?</Text>
              <Text style={styles.reasonBody}>{bundle.reason}</Text>
            </View>
          </View>
          <Text style={styles.questionHint}>서로 관련된 질문 {bundle.estimatedQuestionCount}개만 함께 확인해요.</Text>
          <Appear replayKey={bundleId} style={styles.fields}>
            <BundleFields bundleId={bundleId} profile={draft} onChange={setDraft} />
          </Appear>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
          <MotionPressable accessibilityRole="button" onPress={save} style={styles.primary}>
            <Text style={styles.primaryText}>입력한 정보 저장하기</Text>
          </MotionPressable>
          <MotionPressable accessibilityRole="button" onPress={close} style={styles.later}>
            <Text style={styles.laterText}>나중에</Text>
          </MotionPressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenEnter>
  );
}

function ProfileOverview({
  profile,
  topInset,
  onBack,
  onOpen,
}: {
  profile: ApplicantProfileV2;
  topInset: number;
  onBack: () => void;
  onOpen: (id: ProfileQuestionBundleId) => void;
}) {
  const completeness = calculateProfileCompleteness(profile);
  const nextBundles = PROFILE_BUNDLES.filter((bundle) => getBundleCompletion(profile, bundle.id) !== 'complete').slice(0, 2);
  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(topInset, 12) + 8 }]}>
        <MotionPressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} style={styles.back}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </MotionPressable>
        <Text style={styles.headerTitle}>내 청약 프로필</Text>
        <View style={styles.backGhost} />
      </View>
      <ScrollView contentContainerStyle={styles.overviewScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>PROFILE COMPLETENESS</Text>
              <Text style={styles.heroTitle}>프로필 완성도</Text>
            </View>
            <Text style={styles.heroMetric}>{completeness}%</Text>
          </View>
          <View style={styles.track}>
            <AnimatedBar ratio={completeness / 100} style={styles.fill} />
          </View>
          <Text style={styles.heroNote}>공식 청약 점수나 완판e 준비도가 아닌 정보 입력 완성도예요.</Text>
        </View>

        {nextBundles.length > 0 ? (
          <View style={styles.benefitCard}>
            <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.benefitTitle}>정보 {nextBundles.length}개만 더 확인해보세요</Text>
              <Text style={styles.benefitBody}>{nextBundles.map((bundle) => bundle.benefit).join(' ')}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.list}>
          {PROFILE_BUNDLES.map((bundle, index) => {
            const completion = getBundleCompletion(profile, bundle.id);
            const status = completion === 'complete' ? '완료' : completion === 'partial' ? '일부 완료' : '확인 필요';
            return (
              <MotionPressable
                key={bundle.id}
                accessibilityRole="button"
                onPress={() => onOpen(bundle.id)}
                style={[styles.row, index > 0 && styles.rowBorder]}
              >
                <View style={styles.rowIcon}>
                  <MaterialIcons name={BUNDLE_ICONS[bundle.id]} size={18} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{bundle.title}</Text>
                  <Text style={styles.rowBody} numberOfLines={1}>{bundle.description}</Text>
                </View>
                <Text style={[styles.status, completion === 'complete' && styles.statusDone]}>{status}</Text>
                <MaterialIcons name="chevron-right" size={18} color={colors.outline} />
              </MotionPressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenEnter>
  );
}

function BundleFields({
  bundleId,
  profile,
  onChange,
}: {
  bundleId: ProfileQuestionBundleId;
  profile: ApplicantProfileV2;
  onChange: (profile: ApplicantProfileV2) => void;
}) {
  const set = <K extends keyof ApplicantProfileV2>(key: K, value: ApplicantProfileV2[K]) => onChange({ ...profile, [key]: value });
  const numberField = (value: string, max: number) => {
    const digits = value.replace(/[^0-9]/g, '');
    return digits ? knownField(Math.min(max, Number(digits))) : unknownField<number>();
  };

  switch (bundleId) {
    case 'BASIC':
      return (
        <>
          <Field label="이름 또는 닉네임">
            <TextInput style={styles.input} value={profile.basic.name} onChangeText={(name) => set('basic', { ...profile.basic, name })} />
          </Field>
          <Field label="나이">
            <TextInput style={styles.input} value={String(profile.basic.age)} keyboardType="number-pad" maxLength={3} onChangeText={(value) => set('basic', { ...profile.basic, age: Math.min(99, Math.max(15, Number(value.replace(/[^0-9]/g, '')) || 15)) })} />
          </Field>
          <Field label="지금 하는 일">
            <ChoiceRow options={OCCUPATIONS} value={knownValue(profile.basic.occupation)} onChange={(occupation) => set('basic', { ...profile.basic, occupation: knownField(occupation) })} />
          </Field>
        </>
      );
    case 'RESIDENCE':
      return (
        <Field label="현재 거주지역">
          <ChoiceRow options={REGIONS.map((value) => ({ value, label: shortRegion(value) }))} value={profile.residence.currentRegion} onChange={(currentRegion) => set('residence', { currentRegion })} />
        </Field>
      );
    case 'PREFERENCES':
      return (
        <Field label="관심지역 · 여러 곳 선택 가능">
          <View style={styles.choiceRow}>
            {REGIONS.map((region) => {
              const active = profile.preferences.regions.includes(region);
              return <ChoiceChip key={region} label={shortRegion(region)} active={active} onPress={() => set('preferences', { regions: active ? profile.preferences.regions.filter((item) => item !== region) : [...profile.preferences.regions, region] })} />;
            })}
          </View>
        </Field>
      );
    case 'SUBSCRIPTION_ACCOUNT': {
      const hasAccount = knownValue(profile.subscriptionAccount.hasAccount);
      const updateHasAccount = (value: boolean) => set('subscriptionAccount', value ? {
        hasAccount: knownField(true),
        accountMonths: profile.subscriptionAccount.accountMonths.status === 'not_applicable' ? unknownField() : profile.subscriptionAccount.accountMonths,
        monthlyPayment: profile.subscriptionAccount.monthlyPayment.status === 'not_applicable' ? unknownField() : profile.subscriptionAccount.monthlyPayment,
      } : {
        hasAccount: knownField(false),
        accountMonths: notApplicableField(),
        monthlyPayment: notApplicableField(),
      });
      return (
        <>
          <Field label="청약통장이 있나요?">
            <ChoiceRow options={[{ value: true, label: '있어요' }, { value: false, label: '없어요' }]} value={hasAccount} onChange={updateHasAccount} />
          </Field>
          {hasAccount ? (
            <>
              <Field label="가입한 지 몇 개월 됐나요?">
                <TextInput style={styles.input} keyboardType="number-pad" value={knownValue(profile.subscriptionAccount.accountMonths)?.toString() ?? ''} placeholder="예: 24" placeholderTextColor={colors.outline} onChangeText={(value) => set('subscriptionAccount', { ...profile.subscriptionAccount, accountMonths: numberField(value, 600) })} />
              </Field>
              <Field label="현재 월 납입액 (원)">
                <TextInput style={styles.input} keyboardType="number-pad" value={knownValue(profile.subscriptionAccount.monthlyPayment)?.toString() ?? ''} placeholder="예: 100000" placeholderTextColor={colors.outline} onChangeText={(value) => set('subscriptionAccount', { ...profile.subscriptionAccount, monthlyPayment: numberField(value, 5_000_000) })} />
              </Field>
            </>
          ) : null}
        </>
      );
    }
    case 'HOUSING_HISTORY':
      return (
        <>
          <Field label="현재 본인 명의 주택이 있나요?">
            <ChoiceRow options={[{ value: 'no-home' as const, label: '없어요' }, { value: 'owns-home' as const, label: '있어요' }]} value={knownValue(profile.housing.currentOwnership)} onChange={(currentOwnership) => set('housing', { ...profile.housing, currentOwnership: knownField(currentOwnership) })} />
          </Field>
          <Field label="과거에 주택을 소유한 적이 있나요?">
            <BooleanChoices value={profile.housing.previousOwnership} onChange={(previousOwnership) => set('housing', { ...profile.housing, previousOwnership })} />
          </Field>
          <Field label="현재 세대에 주택 보유자가 있나요?">
            <BooleanChoices value={profile.housing.householdHasHome} onChange={(householdHasHome) => set('housing', { ...profile.housing, householdHasHome })} />
          </Field>
        </>
      );
    case 'HOUSEHOLD':
      return (
        <Field label="현재 세대원은 모두 몇 명인가요?">
          <TextInput style={styles.input} keyboardType="number-pad" value={knownValue(profile.household.memberCount)?.toString() ?? ''} placeholder="본인 포함" placeholderTextColor={colors.outline} onChangeText={(value) => set('household', { memberCount: numberField(value, 20) })} />
        </Field>
      );
    case 'FAMILY': {
      const marriage = knownValue(profile.family.marriageStatus);
      const children = knownValue(profile.family.childrenCount);
      return (
        <>
          <Field label="현재 혼인 상태는 어떤가요?">
            <ChoiceRow options={[{ value: 'single' as const, label: '미혼' }, { value: 'married' as const, label: '기혼' }]} value={marriage} onChange={(marriageStatus) => set('family', { ...profile.family, marriageStatus: knownField(marriageStatus), marriageYears: marriageStatus === 'single' ? notApplicableField() : profile.family.marriageYears.status === 'not_applicable' ? unknownField() : profile.family.marriageYears })} />
          </Field>
          {marriage === 'married' ? (
            <Field label="혼인 기간은 몇 년인가요?">
              <TextInput style={styles.input} keyboardType="number-pad" value={knownValue(profile.family.marriageYears)?.toString() ?? ''} onChangeText={(value) => set('family', { ...profile.family, marriageYears: numberField(value, 80) })} />
            </Field>
          ) : null}
          <Field label="자녀는 몇 명인가요?">
            <TextInput style={styles.input} keyboardType="number-pad" value={children?.toString() ?? ''} placeholder="없으면 0" placeholderTextColor={colors.outline} onChangeText={(value) => {
              const next = numberField(value, 20);
              const count = knownValue(next);
              set('family', { ...profile.family, childrenCount: next, childBirthYears: count === 0 ? notApplicableField() : profile.family.childBirthYears.status === 'not_applicable' ? unknownField() : profile.family.childBirthYears });
            }} />
          </Field>
          {(children ?? 0) > 0 ? (
            <Field label="자녀 출생연도 · 쉼표로 구분">
              <TextInput style={styles.input} keyboardType="numbers-and-punctuation" value={knownValue(profile.family.childBirthYears)?.join(', ') ?? ''} placeholder="예: 2021, 2024" placeholderTextColor={colors.outline} onChangeText={(value) => {
                const years = value.split(',').map((item) => Number(item.trim())).filter((year) => year >= 1900 && year <= new Date().getFullYear());
                set('family', { ...profile.family, childBirthYears: years.length ? knownField(years) : unknownField() });
              }} />
            </Field>
          ) : null}
        </>
      );
    }
    case 'INCOME':
      return (
        <Field label="연 소득 범위">
          <ChoiceRow options={INCOME_RANGES} value={knownValue(profile.income.annualRange)} onChange={(annualRange) => set('income', { annualRange: knownField(annualRange) })} />
        </Field>
      );
    case 'ASSETS':
      return (
        <>
          <MoneyRangeField label="금융자산" value={profile.assets.financial} onChange={(financial) => set('assets', { ...profile.assets, financial })} />
          <MoneyRangeField label="부동산" value={profile.assets.realEstate} onChange={(realEstate) => set('assets', { ...profile.assets, realEstate })} />
          <MoneyRangeField label="차량 가치" value={profile.assets.vehicle} onChange={(vehicle) => set('assets', { ...profile.assets, vehicle })} />
          <MoneyRangeField label="부채" value={profile.assets.debt} onChange={(debt) => set('assets', { ...profile.assets, debt })} />
        </>
      );
  }
}

function MoneyRangeField({ label, value, onChange }: { label: string; value: ProfileFieldState<AmountRange>; onChange: (value: ProfileFieldState<AmountRange>) => void }) {
  return (
    <Field label={label}>
      <View style={styles.choiceRow}>
        <ChoiceChip label="없음" active={value.status === 'not_applicable'} onPress={() => onChange(notApplicableField())} />
        {AMOUNT_RANGES.map((option) => <ChoiceChip key={option.value} label={option.label} active={knownValue(value) === option.value} onPress={() => onChange(knownField(option.value))} />)}
      </View>
    </Field>
  );
}

function BooleanChoices({ value, onChange }: { value: ProfileFieldState<boolean>; onChange: (value: ProfileFieldState<boolean>) => void }) {
  return <ChoiceRow options={[{ value: false, label: '없어요' }, { value: true, label: '있어요' }]} value={knownValue(value)} onChange={(next) => onChange(knownField(next))} />;
}

function ChoiceRow<T extends string | boolean>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T | undefined; onChange: (value: T) => void }) {
  return <View style={styles.choiceRow}>{options.map((option) => <ChoiceChip key={String(option.value)} label={option.label} active={value === option.value} onPress={() => onChange(option.value)} />)}</View>;
}

function ChoiceChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <MotionPressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </MotionPressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

function isBundleId(value: string | undefined): value is ProfileQuestionBundleId {
  return PROFILE_BUNDLES.some((bundle) => bundle.id === value);
}

function shortRegion(region: string) {
  return region.replace('특별시', '').replace('광역시', '').replace('도', '');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.screen, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainer },
  backGhost: { width: 36, height: 36 },
  headerTitle: { ...type.bodyLgStrong, color: colors.text },
  overviewScroll: { padding: spacing.screen, paddingBottom: 44, gap: spacing.md },
  hero: { borderRadius: radius.bento, backgroundColor: colors.primary, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroEyebrow: { ...type.micro, color: 'rgba(255,255,255,0.68)', letterSpacing: 0.8 },
  heroTitle: { ...type.title, color: colors.onPrimary, marginTop: 3 },
  heroMetric: { fontFamily: type.metric.fontFamily, fontSize: 38, lineHeight: 42, color: colors.onPrimary },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.onPrimary },
  heroNote: { ...type.caption, color: 'rgba(255,255,255,0.72)', lineHeight: 18 },
  benefitCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.card, backgroundColor: colors.lavender, borderWidth: 1, borderColor: colors.primaryFixed, padding: spacing.md },
  benefitTitle: { ...type.bodySmStrong, color: colors.text },
  benefitBody: { ...type.caption, color: colors.textMuted, lineHeight: 19, marginTop: 3 },
  list: { borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: spacing.md, ...shadow.card },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: radius.cardSm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  rowTitle: { ...type.bodySmStrong, color: colors.text },
  rowBody: { ...type.caption, color: colors.textSubtle, marginTop: 2 },
  status: { ...type.micro, color: colors.textSubtle },
  statusDone: { color: tint.green.fg },
  editorScroll: { padding: spacing.screen, paddingBottom: 28, gap: spacing.md },
  reasonCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.card, backgroundColor: colors.lavender, padding: spacing.md },
  reasonIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  reasonTitle: { ...type.bodySmStrong, color: colors.primary },
  reasonBody: { ...type.caption, color: colors.textMuted, lineHeight: 19, marginTop: 3 },
  questionHint: { ...type.caption, color: colors.textSubtle },
  fields: { gap: spacing.lg },
  field: { gap: 8 },
  fieldLabel: { ...type.bodySmStrong, color: colors.text },
  input: { ...type.bodyLg, minHeight: size.control, borderRadius: radius.button, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.text },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { ...type.bodySmStrong, color: colors.textMuted },
  choiceTextActive: { color: colors.onPrimary },
  footer: { paddingHorizontal: spacing.screen, paddingTop: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline, gap: 4 },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, backgroundColor: colors.primary },
  primaryText: { ...type.bodyLgStrong, color: colors.onPrimary },
  later: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  laterText: { ...type.bodySmStrong, color: colors.textMuted },
});
