import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useKioskWidth } from './useKioskWidth';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { STEP_LABELS, type InputStep } from '../model';
import { KioskButton } from './controls';
import { chatPath, resetToHome } from './navigation';
import { k } from './theme';
import { router } from 'expo-router';

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
}) {
  const width = useKioskWidth();
  const compactTop = width < 600;
  const gutter = width >= 900 ? 40 : compactTop ? 12 : k.gutter;
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingHorizontal: gutter }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>e</Text></View>
          <Text style={styles.brand}>{brand}</Text>
        </View>
        <View style={[styles.topActions, compactTop && styles.topActionsCompact]}>
          {hideChat ? null : (
            <MotionPressable
              testID="kiosk-chat-button"
              accessibilityRole="button"
              accessibilityLabel="AI 상담 열기"
              onPress={() => router.push(chatPath(chatContextId ?? null) as never)}
              style={[styles.topButton, styles.chatButton, compactTop && styles.topButtonCompact]}
            >
              <MaterialIcons name="forum" size={24} color={k.colors.onPrimary} />
              {compactTop ? null : <Text style={[styles.topButtonLabel, { color: k.colors.onPrimary }]}>AI 상담</Text>}
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
      {progress ? <Progress progress={progress} gutter={gutter} /> : null}
      <ScrollView
        key={scrollKey}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
      {footer ? (
        <View testID="kiosk-footer" style={[styles.footer, { paddingHorizontal: gutter }]}>
          <View style={[styles.inner, styles.footerInner]}>{footer}</View>
        </View>
      ) : null}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.scrim}>
          <View style={styles.dialog} accessibilityRole="alert">
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
  );
}

function Progress({ progress, gutter }: { progress: { steps: InputStep[]; current: InputStep } | { label: string }; gutter: number }) {
  if ('label' in progress) {
    return (
      <View style={[styles.progress, { paddingHorizontal: gutter }]}>
        <Text style={styles.progressLabel}>{progress.label}</Text>
      </View>
    );
  }
  const index = progress.steps.indexOf(progress.current);
  return (
    <View
      style={[styles.progress, { paddingHorizontal: gutter }]}
      accessibilityRole="progressbar"
      accessibilityLabel={`${progress.steps.length}단계 중 ${index + 1}단계, ${STEP_LABELS[progress.current]}`}
      testID="kiosk-progress"
    >
      <View style={styles.progressTrack}>
        {progress.steps.map((step, i) => (
          <View key={step} style={styles.progressItem}>
            <View style={[styles.progressBar, i <= index && styles.progressBarDone]} />
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
  top: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: k.colors.surfaceHigh,
    backgroundColor: k.colors.surface,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { ...k.type.section, color: k.colors.onPrimary, lineHeight: 26 },
  brand: { ...k.type.section, color: k.colors.primary },
  topActions: { flexDirection: 'row', gap: 12 },
  topActionsCompact: { gap: 8 },
  topButton: {
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: k.colors.primaryFixed,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatButton: { backgroundColor: k.colors.primary },
  topButtonCompact: { width: 56, paddingHorizontal: 0, justifyContent: 'center' },
  topButtonLabel: { ...k.type.bodyStrong, color: k.colors.primary },
  progress: { paddingVertical: 14, backgroundColor: k.colors.surface, borderBottomWidth: 1, borderBottomColor: k.colors.surfaceHigh },
  progressLabel: { ...k.type.bodyStrong, color: k.colors.textMuted },
  progressTrack: { flexDirection: 'row', gap: 8 },
  progressItem: { flex: 1, gap: 8 },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: k.colors.surfaceHighest },
  progressBarDone: { backgroundColor: k.colors.primary },
  progressStep: { ...k.type.caption, color: k.colors.textSubtle },
  progressStepCurrent: { fontFamily: k.type.label.fontFamily, color: k.colors.primary },
  progressStepDone: { color: k.colors.textMuted },
  scroll: { flex: 1 },
  content: { paddingTop: 32, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: k.contentMax },
  footer: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: k.colors.surfaceHigh,
    backgroundColor: k.colors.surface,
    alignItems: 'center',
  },
  footerInner: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  scrim: { flex: 1, backgroundColor: 'rgba(28,27,34,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 560, backgroundColor: k.colors.surface, borderRadius: 24, padding: 32, gap: 16 },
  dialogActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' },
});
