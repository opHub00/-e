import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AdminChrome } from '../../features/adminPortal/AdminShell';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { getSupabaseClient } from '../../features/auth/supabaseClient';
import { readPublicRuleReviewTarget } from '../../features/assessmentRuleReview/repository/stagingTarget';
import {
  bindingErrorMessage, SupabaseListingBindingRepository, type ListingBindingRpcClient, type ListingBindingState,
} from '../../features/assessmentRuleReview/repository/ListingBindingRepository';
import { AUDIT_ACTION_LABEL, buildBindingRows, type BindingAction, type BindingRow } from '../../features/assessmentRuleReview/ui/listingBindingPresentation';

type Load = { phase: 'LOADING' } | { phase: 'READY'; state: ListingBindingState } | { phase: 'FAILED'; code: string };

/** Composition root: staging or production identity gate first, then the signed-in Supabase session. */
function useRepository(): SupabaseListingBindingRepository | { code: string } {
  return useMemo(() => {
    try {
      readPublicRuleReviewTarget();
      const client = getSupabaseClient();
      if (!client) return { code: 'REVIEW_CONNECTION_REQUIRED' };
      return new SupabaseListingBindingRepository(client as unknown as ListingBindingRpcClient);
    } catch (error) {
      return { code: error instanceof Error ? error.message : 'REVIEW_CONNECTION_REQUIRED' };
    }
  }, []);
}

/**
 * Admin-only listing ↔ announcement binding operations.
 * Reviewers see the same table read-only. Every change is authorized, validated and audited by the server.
 */
export default function ListingBindingsRoute() {
  const router = useRouter();
  const repository = useRepository();
  const [load, setLoad] = useState<Load>({ phase: 'LOADING' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/home')), [router]);
  const openReview = useCallback((ruleSetId: string) => router.push(`/admin/rule-review?ruleSetId=${ruleSetId}`), [router]);

  const refresh = useCallback(async () => {
    if (!(repository instanceof SupabaseListingBindingRepository)) { setLoad({ phase: 'FAILED', code: repository.code }); return; }
    setLoad({ phase: 'LOADING' });
    const result = await repository.load();
    setLoad(result.status === 'READY' ? { phase: 'READY', state: result.state } : { phase: 'FAILED', code: result.code });
  }, [repository]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (row: BindingRow, action: BindingAction) => {
    if (!(repository instanceof SupabaseListingBindingRepository) || busy) return;
    setBusy(`${row.listingId}:${action.kind}`); setNotice(null);
    const result = action.kind === 'UNBIND'
      ? await repository.unbind({ listingId: row.listingId, expectedRevision: action.expectedRevision, reason })
      : await repository.bind({ listingId: row.listingId, ruleSetId: action.ruleSetId!, expectedRevision: action.expectedRevision, reason });
    setBusy(null);
    if (result.status === 'FAILED') setNotice({ tone: 'error', text: bindingErrorMessage(result.code) });
    else {
      setNotice({ tone: 'ok', text: result.status === 'NO_CHANGE' ? '이미 같은 값으로 연결돼 있어 바꾸지 않았어요.' : `${row.listingId}: ${AUDIT_ACTION_LABEL[result.status]} 완료. 감사 기록에 남았어요.` });
      setReason('');
    }
    await refresh();
  }, [busy, reason, refresh, repository]);

  return (
    <AdminChrome title="공고 listing 연결 관리">
      <>
        {load.phase === 'LOADING' ? <View style={styles.card}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>연결 상태를 불러오는 중이에요</Text></View> : null}
        {load.phase === 'FAILED' ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>{load.code === 'AUTH_REQUIRED' ? '관리자 로그인이 필요해요' : load.code === 'FORBIDDEN' ? '이 계정에는 권한이 없어요' : '연결 상태를 불러오지 못했어요'}</Text>
            <Text style={styles.body}>{load.code === 'AUTH_REQUIRED' || load.code === 'FORBIDDEN' ? bindingErrorMessage(load.code) : '서버에서 확인하지 못해 아무것도 바꾸지 않았어요.'}</Text>
            {load.code === 'AUTH_REQUIRED' ? <Button label="로그인하러 가기" onPress={() => router.push('/auth')} /> : <Button label="다시 불러오기" onPress={() => void refresh()} />}
          </View>
        ) : null}
        {load.phase === 'READY' ? <Ready state={load.state} reason={reason} setReason={setReason} busy={busy} notice={notice} onRun={run} onRefresh={() => void refresh()} onOpenReview={openReview} /> : null}
      </>
    </AdminChrome>
  );
}

function Ready({ state, reason, setReason, busy, notice, onRun, onRefresh, onOpenReview }: {
  state: ListingBindingState; reason: string; setReason: (v: string) => void; busy: string | null;
  notice: { tone: 'ok' | 'error'; text: string } | null; onRun: (row: BindingRow, action: BindingAction) => void; onRefresh: () => void; onOpenReview: (ruleSetId: string) => void;
}) {
  const rows = buildBindingRows(state);
  const admin = state.role === 'admin';
  const titleOf = (id: string | null) => state.announcements.find(a => a.announcementId === id)?.title ?? (id ? id.slice(0, 8) : '없음');
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.badge}>{admin ? '관리자 · 연결·교체·해제 가능' : '검수자 · 읽기 전용'}</Text>
        <Text style={styles.body}>상담과 맞춤판정은 listing에 연결된 공고의 활성 규칙 버전만 읽어요. 연결이 없으면 "준비 중"으로 표시돼요.</Text>
        {admin ? (
          <TextInput accessibilityLabel="변경 사유" value={reason} onChangeText={setReason} maxLength={500}
            placeholder="변경 사유 (감사 기록에 남아요)" placeholderTextColor={colors.outline} style={styles.input} />
        ) : null}
        {notice ? <Text accessibilityRole="alert" style={notice.tone === 'ok' ? styles.ok : styles.error}>{notice.text}</Text> : null}
        <Button label="새로 불러오기" onPress={onRefresh} />
      </View>
      {rows.map(row => (
        <View key={row.listingId} style={styles.card}>
          <Text style={styles.title}>{row.listingId}</Text>
          <Text style={styles.strong}>{row.statusLabel}</Text>
          <Text style={styles.body}>소속 공고: {row.ownerTitle ?? '확인되지 않음'}</Text>
          <Text style={styles.body}>현재 연결: {row.boundTitle ?? '없음'}{row.revision ? ` · revision ${row.revision}` : ''}</Text>
          <Text style={styles.body}>활성 규칙 버전: {row.activeVersion ?? '없음'}</Text>
          {/* 검수 콘솔은 rule set을 지정해야 열린다. 여기서 고른 공고의 활성 버전으로만 이동한다. */}
          {row.activeRuleSetId
            ? <Button label="이 공고의 활성 버전 검수 콘솔 열기" onPress={() => onOpenReview(row.activeRuleSetId!)} />
            : null}
          {row.actions.map(action => (
            <Button key={action.kind} label={busy === `${row.listingId}:${action.kind}` ? '처리 중…' : action.label}
              disabled={!!busy || !reason.trim()} tone={action.kind === 'UNBIND' ? 'danger' : 'primary'} onPress={() => onRun(row, action)} />
          ))}
        </View>
      ))}
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>최근 변경 기록</Text>
        {state.audit.length === 0 ? <Text style={styles.body}>아직 기록이 없어요.</Text> : null}
        {state.audit.slice(0, 12).map(entry => (
          <Text key={entry.id} style={styles.body}>
            {entry.createdAt.slice(0, 16).replace('T', ' ')} · {AUDIT_ACTION_LABEL[entry.action]} · {entry.listingId} · {titleOf(entry.previousAnnouncementId)} → {titleOf(entry.newAnnouncementId)} · r{entry.previousRevision ?? 0}→{entry.newRevision ?? '-'} · {entry.actorRole} · {entry.reason}
          </Text>
        ))}
      </View>
    </>
  );
}

function Button({ label, onPress, disabled, tone = 'soft' }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'soft' | 'primary' | 'danger' }) {
  return (
    <MotionPressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={[styles.button, tone === 'primary' && styles.primary, tone === 'danger' && styles.danger, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, tone !== 'soft' && styles.buttonTextStrong]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xl },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh },
  title: { ...type.section, color: colors.text },
  strong: { ...type.bodyStrong, color: colors.text },
  body: { ...type.body, color: colors.textMuted },
  badge: { ...type.bodyStrong, color: colors.primary },
  ok: { ...type.body, color: colors.primary },
  error: { ...type.body, color: colors.error },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, padding: spacing.sm },
  button: { minHeight: size.touch, borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  danger: { backgroundColor: colors.error, borderColor: colors.error },
  disabled: { opacity: 0.45 },
  buttonText: { ...type.bodyStrong, color: colors.text },
  buttonTextStrong: { color: colors.onPrimary },
});
