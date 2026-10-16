import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useKioskWidth } from './useKioskWidth';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { STEP_LABELS, type InputStep } from '../model';
import { KioskButton } from './controls';
import { chatPath, resetToHome } from './navigation';
import { k } from './theme';
import { ProgressFill } from '../motion/ProgressFill';
import { ScreenReveal } from '../motion/ScreenReveal';
import { router } from 'expo-router';
import { DensityProvider, useDensity } from '../layout/DensityContext';
import { NARROW_PHONE_GUTTER, NARROW_PHONE_MAX_WIDTH } from '../layout/density';
import { BrandMark } from '../brand/BrandMark';
import { PartnerBadge, partnerSizeFor } from '../brand/PartnerBadge';

/**
 * 행사 화면 공통 틀.
 *
 * 위: 브랜드 · 진행 표시 · AI 상담 · 처음으로. AI 상담은 어느 화면에서든 한 번에 열린다.
 * 가운데: 내용(스크롤).
 * 아래: 이전/다음처럼 이 화면에서 할 일. 손이 닿는 아래쪽에 고정한다.
 */
export function KioskFrame({
  brand,
  progress,
  chatContextId,
  hideChat,
  confirmHome = true,
  footer,
  children,
  scrollKey,
  partner = false,
}: {
  brand: string;
  progress?: { steps: InputStep[]; current: InputStep } | { label: string };
  /** AI 상담을 열 때 기준으로 삼을 공고·공급. 없으면 결과의 첫 번째. */
  chatContextId?: string | null;
  hideChat?: boolean;
  /** 입력이 있는 화면에서 '처음으로'를 누르면 한 번 더 묻는다. */
  confirmHome?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  scrollKey?: string;
  /** 삼도이동 1지구 관련 화면: 우측 상단 파트너 로고 표시. */
  partner?: boolean;
}) {
  const width = useKioskWidth();
  const compactTop = width < 600;
  // 밀도(desktop=compact / iPad=comfortable / mobile=touch)가 여백과 본문 폭을 정한다. 안쪽 component 도 같은 값을 읽는다.
  // 폭·높이를 함께 본 밀도: 낮은 화면(≤800px)은 머리·여백을 줄여 내용이 한 화면에 들어오게 한다.
  const { density, d, shortHeight } = useDensity();
  const short = shortHeight && density !== 'touch';
  const gutter = width > 0 && width <= NARROW_PHONE_MAX_WIDTH ? NARROW_PHONE_GUTTER : d.gutter;
  const inner = [styles.inner, { maxWidth: d.contentMax }];
  const [confirming, setConfirming] = useState(false);

  return (
    <DensityProvider density={density}>
    <View style={styles.root}>
      <View style={[styles.top, (density === 'compact' || short) && styles.topCompact, density === 'touch' && styles.topTouch, { paddingHorizontal: gutter }]}>
        <BrandMark size="header" label={brand} compact={compactTop} />
        <View style={[styles.topRight, compactTop && styles.topActionsCompact]}>
          {partner ? <View style={[styles.partnerSlot, compactTop && styles.partnerSlotCompact]}><PartnerBadge size={partnerSizeFor(width)} /></View> : null}
        <View style={[styles.topActions, compactTop && styles.topActionsCompact]}>
          {hideChat ? null : (
            <MotionPressable
              testID="kiosk-chat-button"
              accessibilityRole="button"
              accessibilityLabel="AI 상담 열기"
              onPress={() => router.push(chatPath(chatContextId ?? null) as never)}
              style={[styles.topButton, compactTop && styles.topButtonCompact]}
            >
              <MaterialIcons name="chat-bubble-outline" size={24} color={k.colors.primary} />
              {compactTop ? null : <Text style={styles.topButtonLabel}>AI 상담</Text>}
            </MotionPressable>
          )}
          <MotionPressable
            testID="kiosk-home-button"
            accessibilityRole="button"
            accessibilityLabel="처음으로"
            onPress={() => (confirmHome ? setConfirming(true) : resetToHome())}
            style={[styles.topButton, compactTop && styles.topButtonCompact]}
          >
            <MaterialIcons name="home" size={24} color={k.colors.primary} />
            {compactTop ? null : <Text style={styles.topButtonLabel}>처음으로</Text>}
          </MotionPressable>
        </View>
        </View>
      </View>
      {progress ? <Progress progress={progress} gutter={gutter} touch={density === 'touch' || short} /> : null}
      <ScrollView
        key={scrollKey}
        style={styles.scroll}
        contentContainerStyle={[styles.content, short && styles.contentShort, density === 'touch' && styles.contentTouch, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={inner}><ScreenReveal>{children}</ScreenReveal></View>
      </ScrollView>
      {footer ? (
        <View testID="kiosk-footer" style={[styles.footer, short && styles.footerShort, density === 'touch' && styles.footerTouch, { paddingHorizontal: gutter }]}>
          <View
            style={[
              inner,
              styles.footerInner,
              { maxWidth: Math.min(d.contentMax, Math.max(0, width - gutter * 2)) },
            ]}
          >
            {footer}
          </View>
        </View>
      ) : null}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.scrim}>
          <View style={styles.dialog} accessibilityRole="alert">
            <View style={styles.dialogIcon}><MaterialIcons name="delete-outline" size={32} color={k.colors.primary} /></View>
            <Text style={k.type.title}>처음 화면으로 돌아갈까요?</Text>
            <Text style={[k.type.bodyLg, { color: k.colors.textMuted }]}>입력한 정보와 결과가 모두 지워져요.</Text>
            <View style={styles.dialogActions}>
              <KioskButton label="계속하기" variant="soft" onPress={() => setConfirming(false)} />
              <KioskButton
                testID="kiosk-home-confirm"
                label="처음으로"
                icon="home"
                onPress={() => { setConfirming(false); resetToHome(); }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </DensityProvider>
  );
}

function Progress({ progress, gutter, touch = false }: { progress: { steps: InputStep[]; current: InputStep } | { label: string }; gutter: number; touch?: boolean }) {
  if ('label' in progress) {
    return (
      <View style={[styles.progress, touch && styles.progressTouch, { paddingHorizontal: gutter }]}>
        <Text style={styles.progressLabel}>{progress.label}</Text>
      </View>
    );
  }
  const index = progress.steps.indexOf(progress.current);
  return (
    <View
      style={[styles.progress, touch && styles.progressTouch, { paddingHorizontal: gutter }]}
      accessibilityRole="progressbar"
      accessibilityLabel={`${progress.steps.length}단계 중 ${index + 1}단계, ${STEP_LABELS[progress.current]}`}
      testID="kiosk-progress"
    >
      <View style={styles.progressTrack}>
        {progress.steps.map((step, i) => (
          <View key={step} style={styles.progressItem}>
            <View style={[styles.progressBar, i < index && styles.progressBarDone]}>
              {i === index ? <ProgressFill style={styles.progressFill} /> : null}
            </View>
            <Text style={[styles.progressStep, i === index && styles.progressStepCurrent, i < index && styles.progressStepDone]} numberOfLines={1}>
              {i + 1}. {STEP_LABELS[step]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.background, minHeight: '100%' as unknown as number },
  topCompact: { minHeight: 64 },
  topTouch: { minHeight: 56, gap: 8 },
  top: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: k.colors.surfaceHigh,
    backgroundColor: k.colors.surface,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  partnerSlot: { paddingRight: 12, borderRightWidth: 1, borderRightColor: k.colors.hairline },
  partnerSlotCompact: { paddingRight: 6, borderRightWidth: 0 },
  topActions: { flexDirection: 'row', gap: 12 },
  topActionsCompact: { gap: 4 },
  topButton: {
    minHeight: 48,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topButtonCompact: { width: 44, minHeight: 44, paddingHorizontal: 0, justifyContent: 'center' },
  topButtonLabel: { ...k.type.bodyStrong, color: k.colors.primary },
  progress: { paddingVertical: 20, backgroundColor: k.colors.surface, borderBottomWidth: 1, borderBottomColor: k.colors.surfaceHigh },
  progressLabel: { ...k.type.bodyStrong, color: k.colors.textMuted },
  progressTrack: { flexDirection: 'row', gap: 12 },
  progressItem: { flex: 1, gap: 8 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: k.colors.surfaceHighest, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: k.colors.primary },
  progressBarDone: { backgroundColor: k.colors.primary },
  progressStep: { ...k.type.caption, color: k.colors.textSubtle },
  progressStepCurrent: { fontFamily: k.type.label.fontFamily, color: k.colors.primary },
  progressStepDone: { color: k.colors.textMuted },
  scroll: { flex: 1 },
  content: { paddingTop: 36, paddingBottom: 40, alignItems: 'center' },
  contentTouch: { paddingTop: 16, paddingBottom: 24 },
  contentShort: { paddingTop: 20, paddingBottom: 24 },
  footerShort: { minHeight: 0, paddingVertical: 12 },
  progressTouch: { paddingVertical: 10 },
  inner: { width: '100%', maxWidth: k.contentMax },
  footer: {
    minHeight: 108,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: k.colors.surfaceHigh,
    backgroundColor: k.colors.surface,
    alignItems: 'center',
  },
  // 휴대폰 하단 CTA 영역: 높이를 줄이고(고정 영역이라 본문을 덜 가린다) 버튼은 48~52px.
  footerTouch: { minHeight: 0, paddingVertical: 10 },
  footerInner: { width: 'auto', alignSelf: 'stretch', flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  scrim: { flex: 1, backgroundColor: 'rgba(28,27,34,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 560, backgroundColor: k.colors.surface, borderRadius: 20, padding: 32, gap: 16 },
  dialogIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  dialogActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' },
});
