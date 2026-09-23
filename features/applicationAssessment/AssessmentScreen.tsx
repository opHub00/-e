import { useState, useRef, useEffect } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { QuestionnaireFlow } from './QuestionnaireFlow';
import { SUPPLY_LABELS } from './labels';
import { REFERENCE_LISTING_ID, REFERENCE_RULE_SET } from './reference';
import { announcementResidenceRegion } from './ruleRegion';
import { SOURCE_LABELS, useAssessmentCatalog, useAssessmentRules } from './data/useAssessmentRules';
import { AssessmentResult } from './AssessmentResult';
import { registerAssessmentConsultationSeed } from '../assessmentConsultation/seedStore';
import type { ApplicationAssessmentResult, AssessmentInput, SupplyType } from './types';

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
  const setApplicantProfile = useUserStore(s => s.setApplicantProfile);
  const dataset = useListingDataset();
  const [selected, setSelected] = useState(listingId ?? '');
  const [supply, setSupply] = useState<SupplyType>('youth');
  const [step, setStep] = useState(0);
  const [questionnaireDetails, setQuestionnaireDetails] = useState<AssessmentInput['details']>({});
  const [snapshot, setSnapshot] = useState<{ result: ApplicationAssessmentResult; profile: typeof profile; rulesId: string } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const ruleLoad = useAssessmentRules(selected);
  const rules = ruleLoad.rules;
  const residenceRegion = announcementResidenceRegion(rules);
  const catalog = useAssessmentCatalog();
  useEffect(() => {
    if (rules && !rules.supplies.some(s => s.type === supply)) setSupply(rules.supplies[0].type);
  }, [rules, supply]);
  const selectedListing = dataset.listings.find(l => l.id === selected);
  const title = rules?.title ?? selectedListing?.complexName;
  const result = snapshot?.profile === profile && snapshot.rulesId === rules?.id ? snapshot.result : null;
  const move = (next: number) => { setStep(next); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const resetAnswers = () => { setQuestionnaireDetails({}); setSnapshot(null); };
  const choose = (id: string) => { setSelected(id); resetAnswers(); };
  const editProfile = () => router.push('/profile');
  const askAboutResult = () => {
    if (!result) return;
    const seedId = registerAssessmentConsultationSeed({
      listingId: selected,
      supplyType: supply,
      profile,
      answers: questionnaireDetails,
      result,
    });
    router.push(`/consultation?listingId=${encodeURIComponent(selected)}&seedId=${encodeURIComponent(seedId)}&supplyType=${supply}` as Href);
  };

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScreenHeader title="청약 맞춤판정" onBack={onBack} />
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>{['어떤 공고에 신청할까요?', '내 정보를 확인해 주세요', '공고에 필요한 추가 정보', '내 조건으로 확인한 결과'][step]}</Text>
      <Text style={styles.body}>{step + 1} / 4 · 공고 선택 → 정보 확인 → 추가 질문 → 결과</Text>
      {step === 0 ? <>
        <Text style={styles.body}>신청 조건과 공급단계, 필요한 준비를 함께 확인해요.</Text>
        <Choice label={`${REFERENCE_RULE_SET.title} · 원문 확인 전`} selected={selected === REFERENCE_LISTING_ID} onPress={() => choose(REFERENCE_LISTING_ID)} />
        {catalog.items.map(item => <Choice key={item.id} label={`${item.title} · ${SOURCE_LABELS[item.sourceStatus]}`} selected={selected === `announcement:${item.id}`} onPress={() => choose(`announcement:${item.id}`)} />)}
        {catalog.status === 'LOADING' ? <Text style={styles.body}>등록된 공고 목록을 불러오고 있어요.</Text> : null}
        {catalog.status === 'ERROR' ? <PrimaryButton label="공고 목록을 불러오지 못했어요 · 다시 시도" variant="soft" onPress={catalog.retry} /> : null}
        {catalog.nextCursor && catalog.status === 'AVAILABLE' ? <PrimaryButton label="공고 더 보기" variant="soft" onPress={catalog.more} /> : null}
        {rules && selected !== REFERENCE_LISTING_ID && !selected.startsWith('announcement:') ? <WanpanCard style={styles.stack}><Text style={styles.title}>{rules.title}</Text><Text style={styles.body}>{SOURCE_LABELS[rules.sourceStatus ?? 'REFERENCE']} · 상세에서 선택한 공고</Text></WanpanCard> : null}
        {ruleLoad.state.status === 'LOADING' ? <Text style={styles.body}>선택한 공고의 판정 기준을 불러오고 있어요.</Text> : null}
        {selected && !['AVAILABLE', 'LOADING', 'RULE_NOT_AVAILABLE'].includes(ruleLoad.state.status) ? <WanpanCard style={styles.stack}><Text style={styles.body}>판정 기준을 불러오거나 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</Text><PrimaryButton label="판정 기준 다시 불러오기" variant="soft" onPress={ruleLoad.retry} /></WanpanCard> : null}
        {selected && selected !== REFERENCE_LISTING_ID && ruleLoad.state.status === 'RULE_NOT_AVAILABLE' ? <WanpanCard style={styles.stack}>
          <Text style={styles.title}>{title ?? (dataset.status === 'loading' ? '선택한 공고를 불러오는 중이에요' : '선택한 공고를 확인할 수 없어요')}</Text>
          <Text style={styles.body}>이 공고의 판정 규칙은 아직 준비 중이에요. 원문과 기준을 확인한 뒤 판정을 제공할 수 있어요.</Text>
          <PrimaryButton label="공고 목록 확인하기" variant="soft" onPress={() => router.push('/discovery')} />
        </WanpanCard> : null}
        {rules?.verification === 'REFERENCE_ONLY' ? <WanpanCard style={styles.stack}><Text style={styles.title}>공고 원문 확인 전이에요</Text><Text style={styles.body}>공고에 필요한 조건과 서류를 확인할 수 있어요. 정확한 기준일·금액·배점표가 확인되기 전에는 신청 가능 여부와 점수를 확정하지 않아요.</Text></WanpanCard> : null}
        <PrimaryButton label="내 정보 확인하기" disabled={!rules || !hydrated} onPress={() => move(1)} />
        {!selected ? <Text style={styles.body}>위에서 공고를 선택하면 다음 단계로 넘어갈 수 있어요.</Text> : null}
        {!hydrated ? <Text style={styles.body}>저장한 프로필을 불러오고 있어요.</Text> : null}
      </> : null}
      {step === 1 ? <>
        <Text style={styles.strong}>{title}</Text>
        <Text style={styles.title}>확인할 공급유형</Text>
        {(rules?.supplies.map(s => s.type) ?? []).map(key => <Choice key={key} label={SUPPLY_LABELS[key]} selected={key === supply} onPress={() => { setSupply(key); resetAnswers(); }} />)}
        <WanpanCard style={styles.stack}>
          <Text style={styles.title}>{profile.basic.name}님의 저장된 정보</Text>
          {[
            ['혼인 여부', profile.family.marriageStatus], ['현재 주택소유', profile.housing.currentOwnership],
            ['과거 주택소유', profile.housing.previousOwnership], ['세대 주택소유', profile.housing.householdHasHome],
            ['세대 부적격 과거 주택소유', profile.housing.householdDisqualifyingPreviousOwnership], ['특별공급 제한', profile.housing.hasSpecialSupplyRestriction],
            ['청약통장 보유', profile.subscriptionAccount.hasAccount], ['근로·사업소득 요건', profile.income.workOrBusinessIncomeEligible],
            ['소득세 납부기간(년)', profile.income.incomeTaxPaymentYears],
            ['세대원 수', profile.household.memberCount],
          ].map(([label, field]) => <Text key={label as string} style={styles.body}>{label as string}: {profileValue(field as ProfileFieldState<unknown>)}</Text>)}
          <PrimaryButton label="프로필 확인·수정" variant="soft" onPress={editProfile} />
        </WanpanCard>
        <Text style={styles.body}>저장한 소득·자산 구간을 정확한 금액으로 추정하지 않아요. 모르는 항목은 비워 두셔도 돼요.</Text>
        <PrimaryButton label="추가 정보 입력하기" onPress={() => move(2)} />
        <PrimaryButton label="공고 다시 선택" variant="soft" onPress={() => move(0)} />
      </> : null}
      {step === 2 ? <>
        <Text style={styles.strong}>{SUPPLY_LABELS[supply]}</Text>
        <QuestionnaireFlow
          rules={rules} supply={supply} profile={profile} listingId={selected} residenceRegion={residenceRegion}
          onProfileChange={setApplicantProfile}
          onComplete={(details, nextProfile) => {
            if (!rules) return;
            const assessment = assessApplication(rules, { profile: nextProfile, details }, selected).find(r => r.supplyType === supply);
            if (!assessment) return;
            setQuestionnaireDetails(details);
            setSnapshot({ result: assessment, profile: nextProfile, rulesId: rules.id });
            move(3);
          }}
          onBack={() => move(1)}
        />
      </> : null}
      {step === 3 ? <>
        <Text style={styles.strong}>{title}</Text>
        {result ? <AssessmentResult result={result} onEditProfile={editProfile} onEditAnswers={() => move(2)} onAskAboutResult={askAboutResult} /> : <>
          <Text style={styles.body}>프로필이 변경됐어요. 새 정보로 다시 판정해 주세요.</Text>
          <PrimaryButton label="질문으로 돌아가 다시 판정하기" onPress={() => move(2)} />
        </>}
        <Text style={styles.notice}>입력한 정보를 기준으로 한 예상 판정이며, 최종 자격은 사업주체 및 청약기관 심사를 통해 확정됩니다.</Text>
        {/* 확인 필요 결과에서 다시 판정을 첫 행동으로 두면, 공고 기준이 없는 동안 같은 입력을 되풀이하게 된다. 누락 항목별 수정은 결과 카드 안에 있다. */}
        <PrimaryButton label="준비 단계로 이어가기" onPress={() => router.push('/preparation')} />
        <PrimaryButton label="다른 공급유형 확인하기" variant="soft" onPress={() => move(1)} />
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
  stack: { gap: spacing.sm }, section: { gap: spacing.sm }, hint: { ...type.bodySm, color: colors.textMuted }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: size.touch, borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, padding: spacing.sm, justifyContent: 'center' },
  selected: { backgroundColor: colors.lavender, borderColor: colors.primary }, selectedText: { color: colors.primary },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, padding: spacing.sm },
  inputError: { borderColor: colors.error },
  error: { ...type.bodySm, color: colors.error }, notice: { ...type.bodySm, color: colors.textMuted },
});
