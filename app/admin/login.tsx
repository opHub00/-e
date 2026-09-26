import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/PrimaryButton';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { useAdminAccess } from '../../features/adminPortal/useAdminAccess';
import { ADMIN_ROLE_LABEL, adminAccessMessage } from '../../features/adminPortal/access';

const ADMIN_HOME = '/admin' as const;

/**
 * 관리자 전용 로그인.
 *
 * 인증은 기존 Supabase Auth 그대로다(useAuthStore.signIn). 다른 것은 로그인 이후 경로뿐이다:
 * 권한이 있으면 /admin 으로, 없으면 일반 서비스 화면으로 돌려보내지 않고 이 자리에서
 * "권한 없음"을 알리고 다른 계정으로 다시 로그인할 수 있게 한다.
 */
export default function AdminLoginRoute() {
  const router = useRouter();
  const access = useAdminAccess();
  const signIn = useAuthStore(state => state.signIn);
  const signOut = useAuthStore(state => state.signOut);
  const submitting = useAuthStore(state => state.submitting);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 이미 권한 있는 세션으로 들어오면 곧바로 운영 홈으로 보낸다.
  useEffect(() => {
    if (access.status === 'ALLOWED') router.replace(ADMIN_HOME as Href);
  }, [access.status, router]);

  const submit = async () => {
    setError(null);
    try {
      await signIn(email.trim(), password);
      // 권한 판정은 서버가 한다. useAdminAccess 가 새 세션으로 다시 물어본다.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인하지 못했어요.');
    }
  };

  const useAnotherAccount = async () => {
    await signOut();
    setEmail(''); setPassword(''); setError(null);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.brand}>완판e Admin</Text>
          <Text style={styles.lead}>공고 학습·규칙 검수·listing 연결을 관리하는 운영 화면이에요.</Text>

          {access.status === 'FORBIDDEN' ? (
            <View style={styles.denied}>
              <Text accessibilityRole="alert" style={styles.deniedTitle}>관리자 권한이 없는 계정입니다.</Text>
              <Text style={styles.body}>{access.email ?? '로그인한 계정'}에는 운영 권한이 없어요. 권한이 필요하면 운영 담당자에게 요청해 주세요.</Text>
              <MotionPressable accessibilityRole="button" onPress={() => void useAnotherAccount()} style={styles.secondary}>
                <Text style={styles.secondaryText}>다른 계정으로 로그인</Text>
              </MotionPressable>
            </View>
          ) : null}

          {access.status === 'ERROR' ? (
            <Text accessibilityRole="alert" style={styles.error}>{adminAccessMessage(access.code)}</Text>
          ) : null}

          {access.status === 'ALLOWED' ? (
            <View style={styles.denied}>
              <Text style={styles.deniedTitle}>{ADMIN_ROLE_LABEL[access.role]}로 로그인되어 있어요.</Text>
              <PrimaryButton label="운영 화면으로 가기" onPress={() => router.replace(ADMIN_HOME as Href)} />
            </View>
          ) : (
            <>
              <Field label="이메일">
                <TextInput accessibilityLabel="관리자 이메일" value={email} onChangeText={setEmail}
                  autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress"
                  placeholder="admin@example.com" placeholderTextColor={colors.textSubtle} style={styles.input} />
              </Field>
              <Field label="비밀번호">
                <TextInput accessibilityLabel="관리자 비밀번호" value={password} onChangeText={setPassword}
                  secureTextEntry textContentType="password" placeholder="비밀번호"
                  placeholderTextColor={colors.textSubtle} style={styles.input}
                  onSubmitEditing={() => void submit()} />
              </Field>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              {submitting ? <ActivityIndicator color={colors.primary} /> : null}
              <PrimaryButton label={submitting ? '로그인 중…' : '관리자 로그인'} onPress={() => void submit()} />
            </>
          )}

          <Text style={styles.note}>
            운영 권한은 서버에서 확인해요. 일반 서비스 계정으로는 이 화면에서 더 진행되지 않아요.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.md },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.lg, gap: spacing.sm },
  brand: { ...type.page, color: colors.text },
  lead: { ...type.bodySm, color: colors.textMuted },
  field: { gap: 4, marginTop: spacing.xs },
  fieldLabel: { ...type.bodySmStrong, color: colors.text },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, paddingHorizontal: spacing.md },
  error: { ...type.bodySm, color: colors.error },
  denied: { gap: spacing.sm, backgroundColor: colors.surfaceContainer, borderRadius: radius.button, padding: spacing.md },
  deniedTitle: { ...type.bodyStrong, color: colors.text },
  body: { ...type.bodySm, color: colors.textMuted },
  secondary: { minHeight: size.touch, justifyContent: 'center', alignItems: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary },
  secondaryText: { ...type.bodySmStrong, color: colors.primary },
  note: { ...type.micro, color: colors.textSubtle, marginTop: spacing.xs },
});
