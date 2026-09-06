import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '../components/motion/MotionPressable';
import { ScreenEnter } from '../components/motion/ScreenEnter';
import { colors, radius, shadow, size, spacing, tint, type } from '../design/tokens';
import { useAuthStore } from '../features/auth/useAuthStore';

type Mode = 'login' | 'signup';

export default function AuthRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const submitting = useAuthStore((state) => state.submitting);
  const session = useAuthStore((state) => state.session);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const noticeMessage = useAuthStore((state) => state.noticeMessage);
  const clearMessages = useAuthStore((state) => state.clearMessages);

  const close = () => {
    clearMessages();
    if (router.canGoBack()) router.back();
    else router.replace('/more');
  };
  const changeMode = (next: Mode) => {
    setMode(next);
    setValidation(null);
    clearMessages();
  };
  const submit = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail.includes('@')) {
      setValidation('이메일 주소를 확인해주세요.');
      return;
    }
    if (password.length < 6) {
      setValidation('비밀번호는 6자 이상 입력해주세요.');
      return;
    }
    setValidation(null);
    try {
      if (mode === 'signup') {
        const needsConfirmation = await signUp(normalizedEmail, password);
        if (needsConfirmation) setMode('login');
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch {
      // 사용자용 오류는 store에서 안전한 문구로 변환한다.
    }
  };

  return (
    <ScreenEnter style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          onPress={close}
          style={styles.back}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </MotionPressable>
        <Text style={styles.headerTitle}>계정</Text>
        <View style={styles.backGhost} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconWrap}>
            <MaterialIcons name="cloud-done" size={25} color={colors.primary} />
          </View>
          <Text style={styles.title}>
            {mode === 'login' ? '다른 기기에서도 이어보세요' : '지금까지 입력한 정보를 지켜드릴게요'}
          </Text>
          <Text style={styles.subtitle}>
            로그인하지 않아도 완판e의 모든 기능을 계속 사용할 수 있어요. 계정은 프로필과 저장 공고를 기기 간 동기화할 때만 사용해요.
          </Text>

          <View style={styles.segment}>
            <ModeButton active={mode === 'login'} label="로그인" onPress={() => changeMode('login')} />
            <ModeButton active={mode === 'signup'} label="회원가입" onPress={() => changeMode('signup')} />
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>이메일</Text>
              <TextInput
                accessibilityLabel="이메일"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                value={email}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>비밀번호</Text>
              <TextInput
                accessibilityLabel="비밀번호"
                autoCapitalize="none"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
                placeholder="6자 이상"
                placeholderTextColor={colors.textSubtle}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>
          </View>

          {validation || errorMessage ? (
            <View style={[styles.message, styles.errorMessage]}>
              <MaterialIcons name="error-outline" size={17} color={colors.error} />
              <Text style={styles.errorText}>{validation ?? errorMessage}</Text>
            </View>
          ) : null}
          {noticeMessage ? (
            <View style={[styles.message, styles.successMessage]}>
              <MaterialIcons name="check-circle-outline" size={17} color={colors.success} />
              <Text style={styles.successText}>{noticeMessage}</Text>
            </View>
          ) : null}

          <MotionPressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting }}
            disabled={submitting}
            onPress={() => void submit()}
            style={[styles.primary, submitting && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {submitting ? '안전하게 연결하는 중…' : mode === 'login' ? '로그인' : '계정 만들기'}
            </Text>
          </MotionPressable>

          {session ? (
            <MotionPressable accessibilityRole="button" onPress={close} style={styles.continueButton}>
              <Text style={styles.continueText}>완판e로 돌아가기</Text>
            </MotionPressable>
          ) : (
            <MotionPressable accessibilityRole="button" onPress={close} style={styles.continueButton}>
              <Text style={styles.continueText}>나중에 · 게스트로 계속하기</Text>
            </MotionPressable>
          )}

          <View style={styles.privacyCard}>
            <MaterialIcons name="lock-outline" size={17} color={tint.green.fg} />
            <Text style={styles.privacyText}>
              내 청약 분석과 기기 간 동기화를 위해 저장돼요. 프로필 원문은 분석 로그에 남기지 않아요.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenEnter>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    minHeight: 62,
    paddingHorizontal: spacing.screen,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  back: { width: size.touch, height: size.touch, justifyContent: 'center' },
  backGhost: { width: size.touch },
  headerTitle: { ...type.bodyLgStrong, flex: 1, textAlign: 'center', color: colors.text },
  scroll: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: spacing.screen, paddingTop: 34 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { ...type.page, color: colors.text, letterSpacing: -0.7, marginBottom: 9 },
  subtitle: { ...type.body, color: colors.textMuted, marginBottom: 24 },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceContainer,
    marginBottom: 22,
  },
  modeButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  modeButtonActive: { backgroundColor: colors.surface, ...shadow.card },
  modeText: { ...type.bodySmStrong, color: colors.textSubtle },
  modeTextActive: { color: colors.primary },
  form: { gap: 16 },
  field: { gap: 7 },
  label: { ...type.label, color: colors.textMuted },
  input: {
    ...type.body,
    minHeight: size.control,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 15,
  },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.button, marginTop: 15 },
  errorMessage: { backgroundColor: '#FFF0F0' },
  successMessage: { backgroundColor: tint.green.bg },
  errorText: { ...type.caption, flex: 1, color: colors.error },
  successText: { ...type.caption, flex: 1, color: colors.success },
  primary: {
    minHeight: size.control,
    marginTop: 22,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
  primaryText: { ...type.bodyStrong, color: colors.onPrimary },
  continueButton: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  continueText: { ...type.bodySmStrong, color: colors.primary },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: tint.green.bg,
    padding: 14,
    borderRadius: radius.cardSm,
    marginTop: 18,
  },
  privacyText: { ...type.caption, flex: 1, color: colors.textMuted },
});
