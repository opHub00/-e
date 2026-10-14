import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { injectPersona, isDemoModeEnabled } from '../../features/eventKiosk/demo/demoMode';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { Phase4PersonaId } from '../../features/eventKiosk/phase4Personas';
import { createResultSession } from '../../features/eventKiosk/resultSessionClient';
import { toSamdoPresentationRecommendation } from '../../features/eventKiosk/samdo';
import { samdoRawRecommendationForAnswers } from '../../features/eventKiosk/samdoResult/samdoEvaluate';
import { SamdoRefinementPanel } from '../../features/eventKiosk/samdoResult/SamdoRefinementPanel';
import { buildSamdoResultView } from '../../features/eventKiosk/samdoResult/samdoResultModel';
import { SamdoResultView } from '../../features/eventKiosk/samdoResult/SamdoResultView';
import { buildSamdoQrSummary } from '../../features/eventKiosk/samdoResult/samdoSummary';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { QrCode } from '../../features/eventKiosk/ui/QrCode';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';
import { k } from '../../features/eventKiosk/ui/theme';

const APPLY_HOME_URL = 'https://www.applyhome.co.kr';

/**
 * 한 공고 전용 결과: "이 공고에 어떻게 신청하는 게 가장 유리한가".
 * 방문자가 이미 입력한 답을 그대로 쓰고, 판정·순위는 Codex 판정 결과를 그대로 보여 준다.
 * Demo Mode 빌드에서는 ?persona=NEWLYWED_ONE_CHILD 처럼 시연용 답으로 바로 열 수 있다.
 */
export default function SamdoResultScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const { persona } = useLocalSearchParams<{ persona?: string }>();
  const answers = useKioskStore(state => state.answers);
  const answerStates = useKioskStore(state => state.answerStates);
  const applyRefinementAnswers = useKioskStore(state => state.applyRefinementAnswers);
  const openSamdoChat = useKioskStore(state => state.openSamdoChat);
  const [session, setSession] = useState<{ status: 'idle' | 'creating' | 'error' } | { status: 'ready'; link: string }>({ status: 'idle' });

  useEffect(() => {
    if (!attached || !persona || !isDemoModeEnabled()) return;
    try { injectPersona(persona as Phase4PersonaId, 'withAdaptive'); } catch { /* 알 수 없는 persona 는 무시 */ }
  }, [attached, persona]);

  const result = useMemo(() => {
    if (!answers.householdType) return null;
    try {
      const rawRecommendation = samdoRawRecommendationForAnswers(answers);
      const recommendation = toSamdoPresentationRecommendation(rawRecommendation);
      return { rawRecommendation, recommendation, view: buildSamdoResultView(recommendation) };
    } catch {
      return 'error' as const;
    }
  }, [answers]);

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  if (!attached) return <KioskFrame brand={brand} confirmHome={false}><View /></KioskFrame>;
  if (!result || result === 'error') {
    return (
      <KioskFrame brand={brand} confirmHome={false}>
        <EmptyState
          title={result === 'error' ? '이 공고 분석을 지금 열 수 없어요' : '먼저 정보를 입력해 주세요'}
          body={result === 'error' ? '잠시 후 다시 시도해 주세요. 입력한 정보는 그대로 남아 있어요.' : '가구 형태부터 몇 가지를 답하면 이 공고에 가장 유리한 신청유형을 알려 드려요.'}
          action={{ label: '처음부터 시작하기', onPress: resetToHome }}
        />
      </KioskFrame>
    );
  }

  const saveQr = async () => {
    if (session.status === 'creating') return;
    const base = load.event.config.shareBaseUrl ?? (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null);
    if (!base) { setSession({ status: 'error' }); return; }
    setSession({ status: 'creating' });
    try {
      const summary = buildSamdoQrSummary({ eventId: load.event.config.id, date: new Date().toISOString().slice(0, 10), recommendation: result.recommendation, view: result.view });
      const created = await createResultSession(base, summary);
      setSession({ status: 'ready', link: created.url });
    } catch {
      setSession({ status: 'error' });
    }
  };

  const qrSlot = session.status === 'ready' ? (
    <View testID="samdo-qr-panel" style={styles.qr}>
      <View {...({ dataSet: { link: session.link } } as object)}><QrCode value={session.link} size={200} testID="samdo-qr-code" /></View>
      <View style={styles.qrCopy}>
        <Text style={[k.type.bodyStrong, { color: k.colors.text }]}>휴대폰 카메라로 찍어 주세요</Text>
        <Text style={[k.type.caption, { color: k.colors.textMuted }]}>추천 유형과 준비 서류를 휴대폰에서 다시 볼 수 있어요. 링크는 6시간 뒤 만료되고 이름·생년월일·소득은 담지 않아요.</Text>
      </View>
    </View>
  ) : session.status === 'error' ? <Notice tone="warn">QR을 아직 만들지 못했어요. 잠시 후 다시 시도해 주세요.</Notice> : null;

  return (
    <KioskFrame
      brand={brand}
      partner
      confirmHome={false}
      footer={
        <View style={styles.footer}>
          <KioskButton testID="samdo-back" label="입력 확인" icon="arrow-back" variant="ghost" onPress={() => router.replace('/event/subscription' as never)} />
          <KioskButton testID="samdo-restart" label="다시 분석하기" icon="refresh" onPress={resetToHome} />
        </View>
      }
    >
      <SamdoResultView
        model={result.view}
        actions={{
          onApplyHome: () => { void Linking.openURL(APPLY_HOME_URL); },
          onAskAi: () => {
            openSamdoChat(load.event, result.recommendation);
            router.push('/event/chat' as never);
          },
          onSaveQr: () => { void saveQr(); },
          qrBusy: session.status === 'creating',
          qrSlot,
          refinementSlot: (
            <SamdoRefinementPanel
              answers={answers}
              answerStates={answerStates}
              recommendation={result.rawRecommendation}
              onResolve={resolved => applyRefinementAnswers(resolved.answers, resolved.answerKeys)}
            />
          ),
        }}
      />
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  qr: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 16, borderRadius: k.radius.md, backgroundColor: k.colors.surfaceLow },
  qrCopy: { flex: 1, minWidth: 200, gap: 4 },
});
