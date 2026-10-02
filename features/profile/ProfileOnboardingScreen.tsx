import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../../components/BackButton';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { ScreenEnter } from '../../components/motion/ScreenEnter';
import { colors, radius, size, spacing, tint, type } from '../../design/tokens';
import { useAuthStore } from '../auth/useAuthStore';
import { formatDateInput, normalizeDateInput } from '../applicationAssessment/questionnaire/dateInput';
import { getRegionLabel, PROFILE_REGIONS } from '../discovery/regions';
import { AuthGate } from '../userCentricAssessment/AuthGate';
import { safeAuthReturnTo } from '../userCentricAssessment/authPolicy';
import { userCentricFeatureFlags } from '../userCentricAssessment/featureFlags';
import { compareApplicantProfileV3Conflict } from './v3Conflict';
import { createEmptyApplicantProfileV3, type ApplicantProfileV3 } from './v3';
import {
  applicantProfileV3Fields,
  isInitialApplicantProfileComplete,
  missingInitialProfileFields,
  profileFieldValue,
  updateApplicantProfileV3Field,
  type ApplicantProfileFieldDefinition,
  type ApplicantProfileFieldId,
} from './v3Completeness';
import {
  keepLocalApplicantProfileV3ConflictDraft,
  reloadApplicantProfileV3FromServer,
  useApplicantProfileV3Store,
} from './useApplicantProfileV3Store';
import { persistApplicantProfileV3FromOnboarding } from './v3OnboardingController';

const flags = userCentricFeatureFlags();

export function ProfileOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ field?: string; returnTo?: string | string[] }>();
  const returnTo = safeAuthReturnTo(params.returnTo) ?? '/assessment';
  const session = useAuthStore(state => state.session);
  const profileState = useApplicantProfileV3Store();
  const [draft, setDraft] = useState<ApplicantProfileV3 | null>(null);
  const [fieldIds, setFieldIds] = useState<ApplicantProfileFieldId[]>([]);
  const [step, setStep] = useState(0);
  const [rawValue, setRawValue] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [initializedKey, setInitializedKey] = useState<string | null>(null);

  const requested = applicantProfileV3Fields.find(field => field.id === params.field);
  const initializationKey = `${session?.user.id ?? 'none'}:${requested?.id ?? 'initial'}:${profileState.source ?? 'none'}`;

  useEffect(() => {
    if (!session || profileState.status !== 'ready' || initializedKey === initializationKey) return;
    const source = profileState.profile ?? createEmptyApplicantProfileV3();
    setDraft(source);
    setFieldIds(requested ? [requested.id] : missingInitialProfileFields(source).map(field => field.id));
    setStep(0);
    setInitializedKey(initializationKey);
  }, [initializationKey, initializedKey, profileState.profile, profileState.status, requested, session]);

  const field = applicantProfileV3Fields.find(definition => definition.id === fieldIds[step]);
  const currentProfile = draft ?? profileState.profile ?? createEmptyApplicantProfileV3();

  useEffect(() => {
    if (!field) { setRawValue(''); return; }
    const value = profileFieldValue(currentProfile, field.id);
    setRawValue(value === undefined ? '' : String(value));
    setValidation(null);
  }, [field?.id, step]); // current draft must not reset an in-progress input

  const conflict = useMemo(() => {
    if (!profileState.conflict?.server) return null;
    return compareApplicantProfileV3Conflict({
      base: profileState.conflict.base,
      local: profileState.conflict.local,
      server: profileState.conflict.server.profile,
      serverRevision: profileState.conflict.server.revision,
    });
  }, [profileState.conflict]);

  const saveValue = async (value: string | number | boolean) => {
    if (!field) return;
    const next = updateApplicantProfileV3Field(currentProfile, field.id, value);
    setDraft(next);
    const last = step >= fieldIds.length - 1;
    try {
      await persistApplicantProfileV3FromOnboarding(next, {
        completedAt: isInitialApplicantProfileComplete(next) ? new Date().toISOString() : null,
      });
      if (last) router.replace(returnTo as Href);
      else setStep(index => index + 1);
    } catch {
      // Repository/store owns safe error and conflict states.
    }
  };

  const submitText = () => {
    if (!field) return;
    if (field.kind === 'DATE') {
      const normalized = normalizeDateInput(rawValue);
      if (normalized.status !== 'OK') { setValidation(normalized.status === 'INVALID' ? normalized.message : '날짜를 입력해주세요.'); return; }
      void saveValue(normalized.value);
      return;
    }
    const numeric = Number(rawValue.replaceAll(',', ''));
    if (!Number.isSafeInteger(numeric) || numeric < 0) {
      setValidation('0 이상의 숫자로 입력해주세요.');
      return;
    }
    void saveValue(numeric);
  };

  return (
    <AuthGate enabled={flags.userCentricProfileV3} returnTo={`/profile-onboarding?returnTo=${encodeURIComponent(returnTo)}`}>
      <ScreenEnter style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <BackButton onPress={() => step > 0 ? setStep(index => index - 1) : router.back()} accessibilityLabel="뒤로" />
          <Text style={styles.headerTitle}>{requested ? '정보 추가' : '내 청약정보 시작하기'}</Text>
          <View style={styles.headerGhost} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {profileState.status === 'loading' || !draft ? (
              <StateCard icon="cloud-download" title="저장된 정보를 불러오고 있어요" body="이미 입력한 항목은 다시 묻지 않을게요." loading />
            ) : profileState.status === 'conflict' ? (
              <View style={styles.card}>
                <MaterialIcons name="sync-problem" size={28} color={colors.warning} />
                <Text style={styles.title}>다른 기기에서 정보가 변경됐어요</Text>
                <Text style={styles.body}>현재 입력은 보존했습니다. 서버 최신값을 다시 불러오거나, 현재 입력을 유지한 뒤 다시 저장할 수 있어요.</Text>
                {conflict ? <Text style={styles.meta}>확인이 필요한 항목 {conflict.requiresUserChoiceFields.length}개 · 그대로 합칠 수 있는 항목 {conflict.autoMergeSafeFields.length}개</Text> : null}
                <MotionPressable accessibilityRole="button" onPress={() => void reloadApplicantProfileV3FromServer()} style={styles.primary}>
                  <Text style={styles.primaryText}>서버 최신값 불러오기</Text>
                </MotionPressable>
                <MotionPressable accessibilityRole="button" onPress={keepLocalApplicantProfileV3ConflictDraft} style={styles.secondary}>
                  <Text style={styles.secondaryText}>현재 입력 유지</Text>
                </MotionPressable>
              </View>
            ) : profileState.status === 'error' ? (
              <StateCard icon="cloud-off" title="프로필을 불러오지 못했어요" body="연결을 확인한 뒤 다시 시도해주세요." />
            ) : !field ? (
              <View style={styles.card}>
                <MaterialIcons name="verified" size={30} color={colors.success} />
                <Text style={styles.title}>분석을 시작할 기본 정보가 준비됐어요</Text>
                <Text style={styles.body}>기존에 입력한 정보는 그대로 사용합니다. Portfolio에서 필요한 정보만 나중에 추가할 수 있어요.</Text>
                <MotionPressable accessibilityRole="button" onPress={() => void persistApplicantProfileV3FromOnboarding(currentProfile, { completedAt: new Date().toISOString() }).then(() => router.replace(returnTo as Href))} style={styles.primary}>
                  <Text style={styles.primaryText}>Portfolio 시작하기</Text>
                </MotionPressable>
              </View>
            ) : (
              <View style={styles.card}>
                {!requested ? (
                  <>
                    <Text style={styles.progress}>기본 정보 {step + 1} / {fieldIds.length}</Text>
                    <View style={styles.progressTrack}><View style={[styles.progressBar, { width: `${((step + 1) / Math.max(fieldIds.length, 1)) * 100}%` }]} /></View>
                  </>
                ) : null}
                <Text style={styles.title}>{field.label}</Text>
                <Text style={styles.body}>{field.help}</Text>
                <FieldInput field={field} rawValue={rawValue} setRawValue={setRawValue} onSelect={value => void saveValue(value)} />
                {validation ? <Text style={styles.error}>{validation}</Text> : null}
                {['DATE', 'INTEGER', 'MONEY'].includes(field.kind) ? (
                  <MotionPressable accessibilityRole="button" accessibilityState={{ disabled: profileState.status === 'saving' }} disabled={profileState.status === 'saving'} onPress={submitText} style={styles.primary}>
                    <Text style={styles.primaryText}>{profileState.status === 'saving' ? '저장 중…' : step === fieldIds.length - 1 ? '저장하고 계속하기' : '저장하고 다음'}</Text>
                  </MotionPressable>
                ) : null}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenEnter>
    </AuthGate>
  );
}

function FieldInput({ field, rawValue, setRawValue, onSelect }: {
  field: ApplicantProfileFieldDefinition;
  rawValue: string;
  setRawValue: (value: string) => void;
  onSelect: (value: string | boolean) => void;
}) {
  if (field.kind === 'REGION') return (
    <View style={styles.options}>{PROFILE_REGIONS.map(region => (
      <Option key={region} label={getRegionLabel(region)} selected={rawValue === region} onPress={() => onSelect(region)} />
    ))}</View>
  );
  if (field.kind === 'BOOLEAN') return (
    <View style={styles.options}>
      <Option label="예" selected={rawValue === 'true'} onPress={() => onSelect(true)} />
      <Option label="아니요" selected={rawValue === 'false'} onPress={() => onSelect(false)} />
    </View>
  );
  if (field.kind === 'CHOICE') return (
    <View style={styles.options}>{field.options?.map(option => (
      <Option key={String(option.value)} label={option.label} selected={rawValue === String(option.value)} onPress={() => onSelect(option.value)} />
    ))}</View>
  );
  return (
    <TextInput
      accessibilityLabel={field.label}
      keyboardType={field.kind === 'DATE' ? 'number-pad' : 'numeric'}
      onChangeText={value => setRawValue(field.kind === 'DATE' ? formatDateInput(value) : value.replace(/[^0-9]/g, ''))}
      placeholder={field.kind === 'DATE' ? 'YYYY-MM-DD' : field.kind === 'MONEY' ? '원 단위 숫자' : '숫자'}
      placeholderTextColor={colors.textSubtle}
      style={styles.input}
      value={rawValue}
    />
  );
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <MotionPressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.option, selected && styles.optionSelected]}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </MotionPressable>
  );
}

function StateCard({ icon, title, body, loading = false }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string; loading?: boolean }) {
  return <View style={styles.card}>{loading ? <ActivityIndicator color={colors.primary} /> : <MaterialIcons name={icon} size={28} color={colors.warning} />}<Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { minHeight: 62, paddingHorizontal: spacing.screen, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.hairline },
  headerTitle: { ...type.bodyLgStrong, color: colors.text, flex: 1, textAlign: 'center' }, headerGhost: { width: size.iconButton },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: spacing.screen, paddingBottom: spacing.xl },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  title: { ...type.section, color: colors.text }, body: { ...type.body, color: colors.textMuted }, meta: { ...type.caption, color: colors.textMuted },
  progress: { ...type.bodySmStrong, color: colors.primary }, progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceContainer }, progressBar: { height: 6, backgroundColor: colors.primary },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, option: { minHeight: size.touch, paddingHorizontal: spacing.md, justifyContent: 'center', borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, backgroundColor: colors.surface }, optionSelected: { borderColor: colors.primary, backgroundColor: colors.lavender }, optionText: { ...type.bodySmStrong, color: colors.textMuted }, optionTextSelected: { color: colors.primary },
  input: { ...type.body, minHeight: size.control, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, color: colors.text, paddingHorizontal: spacing.md },
  error: { ...type.bodySm, color: colors.error },
  primary: { minHeight: size.control, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, primaryText: { ...type.bodyStrong, color: colors.onPrimary },
  secondary: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' }, secondaryText: { ...type.bodySmStrong, color: colors.primary },
});
