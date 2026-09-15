import { useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { WanpanCard } from '../../components/WanpanCard';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { useUserStore } from '../../store/useUserStore';
import { useListingDataset } from '../discovery/data/useListingDataset';
import type { ProfileFieldState } from '../profile/domain';
import { assessApplication } from './engine';
import { FORM_FIELDS, parseForm } from './form';
import { REFERENCE_LISTING_ID, rulesForListing, samdoReferenceRules, SUPPLY_LABELS } from './referenceRules';
import { AssessmentResult } from './AssessmentResult';
import type { ApplicationAssessmentResult, SupplyType } from './types';

const profileValue = (field: ProfileFieldState<unknown>) => field.status !== 'known' ? '확인 전' : typeof field.value === 'boolean' ? (field.value ? '예' : '아니요') : ({ single: '미혼', married: '기혼', 'no-home': '무주택', 'owns-home': '주택 보유' }[String(field.value)] ?? String(field.value));

export default function AssessmentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ listingId?: string }>();
  // Re-keying the child clears prior answers/results when the listing context changes.
  return <AssessmentFlow key={params.listingId ?? 'home'} listingId={params.listingId} onBack={() => router.canGoBack() ? router.back() : router.replace('/home')} />;
}

function AssessmentFlow({ listingId, onBack }: { listingId?: string; onBack: () => void }) {
  const router = useRouter();
  const profile = useUserStore(s => s.applicantProfile);
  const hydrated = useUserStore(s => s.profileHydrated);
  const dataset = useListingDataset();
  const [selected, setSelected] = useState(listingId ?? '');
  const [supply, setSupply] = useState<SupplyType>('youth');
  const [step, setStep] = useState(0);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<{ result: ApplicationAssessmentResult; profile: typeof profile } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const rules = rulesForListing(selected);
  const selectedListing = dataset.listings.find(l => l.id === selected);
  const title = rules?.title ?? selectedListing?.complexName;
  const parsed = parseForm(raw, supply);
  const result = snapshot?.profile === profile ? snapshot.result : null;
  const update = (key: string, value: string) => { setRaw(p => ({ ...p, [key]: value })); setSnapshot(null); };
  const move = (next: number) => { setStep(next); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const choose = (id: string) => { setSelected(id); setRaw({}); setSnapshot(null); };
  const calculate = () => {
    if (!rules || !hydrated || parsed.errors.length) return;
    const assessment = assessApplication(rules, { profile, details: parsed.details }, selected).find(r => r.supplyType === supply)!;
    setSnapshot({ result: assessment, profile }); move(3);
  };
  const editProfile = () => router.push('/profile');

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScreenHeader title="청약 맞춤판정" onBack={onBack} />
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>{['어떤 공고에 신청할까요?', '내 정보를 확인해 주세요', '공고에 필요한 추가 정보', '내 조건으로 확인한 결과'][step]}</Text>
      <Text style={styles.body}>{step + 1} / 4 · 공고 선택 → 정보 확인 → 추가 질문 → 결과</Text>
      {step === 0 ? <>
        <Text style={styles.body}>신청 조건과 공급단계, 필요한 준비를 함께 확인해요.</Text>
        <Choice label={`${samdoReferenceRules.title} · 원문 확인 전`} selected={selected === REFERENCE_LISTING_ID} onPress={() => choose(REFERENCE_LISTING_ID)} />
        {selected && selected !== REFERENCE_LISTING_ID ? <WanpanCard style={styles.stack}>
          <Text style={styles.title}>{title ?? (dataset.status === 'loading' ? '선택한 공고를 불러오는 중이에요' : '선택한 공고를 확인할 수 없어요')}</Text>
          <Text style={styles.body}>이 공고의 판정 규칙은 아직 준비 중이에요. 원문과 기준을 확인한 뒤 판정을 제공할 수 있어요.</Text>
          <PrimaryButton label="공고 목록 확인하기" variant="soft" onPress={() => router.push('/discovery')} />
        </WanpanCard> : null}
        {rules ? <WanpanCard style={styles.stack}><Text style={styles.title}>공고 원문 확인 전이에요</Text><Text style={styles.body}>지금은 삼도이동 공고에 필요한 조건과 서류를 확인할 수 있어요. 정확한 기준일·금액·배점표가 확인되기 전에는 신청 가능 여부와 점수를 확정하지 않아요.</Text></WanpanCard> : null}
        <PrimaryButton label="내 정보 확인하기" disabled={!rules || !hydrated} onPress={() => move(1)} />
        {!hydrated ? <Text style={styles.body}>저장한 프로필을 불러오고 있어요.</Text> : null}
      </> : null}
      {step === 1 ? <>
        <Text style={styles.strong}>{title}</Text>
        <Text style={styles.title}>확인할 공급유형</Text>
        {(Object.keys(SUPPLY_LABELS) as SupplyType[]).map(key => <Choice key={key} label={SUPPLY_LABELS[key]} selected={key === supply} onPress={() => { setSupply(key); setRaw({}); setSnapshot(null); }} />)}
        <WanpanCard style={styles.stack}>
          <Text style={styles.title}>{profile.basic.name}님의 저장된 정보</Text>
          {[
            ['혼인 여부', profile.family.marriageStatus], ['현재 주택소유', profile.housing.currentOwnership],
            ['과거 주택소유', profile.housing.previousOwnership], ['세대 주택소유', profile.housing.householdHasHome],
            ['세대 부적격 과거 주택소유', profile.housing.householdDisqualifyingPreviousOwnership], ['특별공급 제한', profile.housing.hasSpecialSupplyRestriction],
            ['청약통장 보유', profile.subscriptionAccount.hasAccount], ['근로·사업소득 요건', profile.income.workOrBusinessIncomeEligible],
            ['소득세 납부기간(년)', profile.income.incomeTaxPaymentYears],
          ].map(([label, field]) => <Text key={label as string} style={styles.body}>{label as string}: {profileValue(field as ProfileFieldState<unknown>)}</Text>)}
          <PrimaryButton label="프로필 확인·수정" variant="soft" onPress={editProfile} />
        </WanpanCard>
        <Text style={styles.body}>저장한 소득·자산 구간을 정확한 금액으로 추정하지 않아요. 모르는 항목은 비워 두셔도 돼요.</Text>
        <PrimaryButton label="추가 정보 입력하기" onPress={() => move(2)} />
        <PrimaryButton label="공고 다시 선택" variant="soft" onPress={() => move(0)} />
      </> : null}
      {step === 2 ? <>
        <Text style={styles.strong}>{SUPPLY_LABELS[supply]}</Text>
        <Text style={styles.body}>공고 기준일의 정보를 입력해 주세요. 추가 입력은 이 화면에서만 사용해요. 우선공급 대상·무주택 시작일은 공고를 확인한 경우에만 답해 주세요.</Text>
        <WanpanCard style={styles.stack}>
          <Text style={styles.title}>공고 기준일에 제주에 거주했나요?</Text>
          <Text style={styles.body}>현재 프로필 거주지: {profile.residence.currentRegion}</Text>
          {profile.residence.currentRegion !== '제주특별자치도' ? <Choice label={`프로필 거주지와 같아요 (${profile.residence.currentRegion})`} selected={raw.currentResidence === profile.residence.currentRegion} onPress={() => update('currentResidence', profile.residence.currentRegion)} /> : null}
          <Choice label="제주특별자치도" selected={raw.currentResidence === '제주특별자치도'} onPress={() => update('currentResidence', '제주특별자치도')} />
          <Choice label="제주 외 지역" selected={raw.currentResidence === '기타'} onPress={() => update('currentResidence', '기타')} />
          <Choice label="확인 전" selected={!raw.currentResidence} onPress={() => update('currentResidence', '')} />
        </WanpanCard>
        {supply === 'newlywed' ? <WanpanCard style={styles.stack}><Text style={styles.title}>가족 유형</Text>{[['married', '신혼부부'], ['engaged', '예비신혼부부'], ['singleParent', '한부모'], ['', '확인 전']].map(([key, label]) => <Choice key={key} label={label} selected={(raw.familyCategory ?? '') === key} onPress={() => update('familyCategory', key)} />)}</WanpanCard> : null}
        {FORM_FIELDS.filter(f => !f.supplies || f.supplies.includes(supply)).map(field => <WanpanCard key={field.key} style={styles.stack}>
          <Text style={styles.strong}>{field.label}</Text>
          {field.kind === 'boolean' ? <BooleanChoices value={raw[field.key]} onChange={value => update(field.key, value)} /> : <TextInput
            accessibilityLabel={field.label} value={raw[field.key] ?? ''} onChangeText={value => update(field.key, value)}
            placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : field.kind === 'children' ? '2020-01-01, 2023-01-01 또는 없음' : '모르면 비워 두세요'}
            placeholderTextColor={colors.textSubtle} keyboardType={field.kind === 'number' ? 'numeric' : 'default'} autoCapitalize="none" style={styles.input}
          />}
        </WanpanCard>)}
        <WanpanCard style={styles.stack}><Text style={styles.strong}>거주기간 중 해외 체류 이력이 있나요?</Text><BooleanChoices value={raw.overseas} onChange={v => update('overseas', v)} /><Text style={styles.body}>이력이 있으면 공고의 연속거주 인정 기준을 추가로 확인해요.</Text></WanpanCard>
        <WanpanCard style={styles.stack}><Text style={styles.strong}>태아 인정 등 별도 특례를 적용해야 하나요?</Text><BooleanChoices value={raw.exceptions} onChange={v => update('exceptions', v)} /></WanpanCard>
        {parsed.errors.map(error => <Text key={error} accessibilityRole="alert" style={styles.error}>{error}</Text>)}
        <PrimaryButton label="내 조건으로 판정하기" disabled={parsed.errors.length > 0 || !hydrated} onPress={calculate} />
        <PrimaryButton label="유형·프로필 다시 확인" variant="soft" onPress={() => move(1)} />
      </> : null}
      {step === 3 ? <>
        <Text style={styles.strong}>{title}</Text>
        {result ? <AssessmentResult result={result} /> : <Text style={styles.body}>프로필이 변경됐어요. 새 정보로 다시 판정해 주세요.</Text>}
        <Text style={styles.notice}>입력한 정보를 기준으로 한 예상 판정이며, 최종 자격은 사업주체/청약기관 심사를 통해 확정됩니다.</Text>
        <PrimaryButton label="부족한 정보 확인·다시 판정" onPress={() => move(2)} />
        <PrimaryButton label="다른 공급유형 확인하기" variant="soft" onPress={() => move(1)} />
        <PrimaryButton label="준비 단계로 이어가기" variant="soft" onPress={() => router.push('/preparation')} />
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <MotionPressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.selected]}><Text style={[styles.body, selected && styles.selectedText]}>{label}</Text></MotionPressable>;
}
function BooleanChoices({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return <View style={styles.choices}>{[['yes', '예'], ['no', '아니요'], ['', '확인 전']].map(([key, label]) => <Choice key={key} label={label} selected={(value ?? '') === key} onPress={() => onChange(key)} />)}</View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.screen, paddingBottom: spacing.xl, gap: spacing.md },
  heading: { ...type.page, color: colors.text }, title: { ...type.section, color: colors.text }, strong: { ...type.bodyStrong, color: colors.text }, body: { ...type.body, color: colors.textMuted },
  stack: { gap: spacing.sm }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: size.touch, borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, padding: spacing.sm, justifyContent: 'center' },
  selected: { backgroundColor: colors.lavender, borderColor: colors.primary }, selectedText: { color: colors.primary },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, padding: spacing.sm },
  error: { ...type.body, color: colors.error }, notice: { ...type.bodySm, color: colors.textMuted },
});
