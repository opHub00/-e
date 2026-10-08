import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { BUCKET_LABELS, type KioskOutcome } from '../evaluate';
import { bucketTone, k } from '../ui/theme';
import { humanize } from '../presentation';
import { cautionLines, useListingExplanation } from './useExplanation';

/**
 * 최종 요약의 '선택한 공고' 상세. 관심 공고마다 신청 상태, 핵심 주의사항, 추가 확인 항목을 한 장에 정리한다.
 * 화면 전용이다. QR 로 넘기는 요약(ResultSummary)의 모양은 바꾸지 않는다.
 */
export function SelectedListings({ outcomes }: { outcomes: KioskOutcome[] }) {
  if (!outcomes.length) return null;
  return (
    <View style={styles.list} testID="summary-selected">
      {outcomes.map(outcome => <SelectedListing key={outcome.id} outcome={outcome} />)}
    </View>
  );
}

function SelectedListing({ outcome }: { outcome: KioskOutcome }) {
  const explanation = useListingExplanation(outcome);
  const tone = bucketTone[outcome.bucket];
  const cautions = outcome.status === 'INELIGIBLE' ? explanation.unmet : cautionLines(explanation).filter(line => !line.startsWith('확인 필요') && !line.startsWith('서류 확인'));
  const checks = [...explanation.toConfirm, ...explanation.documents.map(item => `${item}(서류)`)];
  return (
    <View style={styles.item} testID="summary-selected-item">
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{outcome.listing.title}</Text>
          <Text style={styles.meta}>{outcome.supplyLabel}{outcome.stageLabel ? ` · ${humanize(outcome.stageLabel)}` : ''}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <MaterialIcons name={tone.icon} size={18} color={tone.fg} />
          <Text style={[styles.badgeText, { color: tone.fg }]}>{BUCKET_LABELS[outcome.bucket]}</Text>
        </View>
      </View>
      <Text style={styles.verdict}>{explanation.verdict.title} · 공식 점수 {explanation.score.title}</Text>
      {cautions.length ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>핵심 주의사항</Text>
          {cautions.slice(0, 3).map(line => <Text key={line} style={styles.line}>· {line}</Text>)}
        </View>
      ) : null}
      {checks.length && outcome.status !== 'INELIGIBLE' ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>추가 확인 항목</Text>
          {checks.slice(0, 4).map(line => <Text key={line} style={styles.line}>· {line}</Text>)}
        </View>
      ) : null}
      {!cautions.length && !checks.length ? <Text style={styles.ok}>추가로 확인할 항목이 없어요. 접수 일정을 확인하세요.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  item: { gap: 10, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.background },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { ...k.type.bodyLgStrong, color: k.colors.text },
  meta: { ...k.type.body, color: k.colors.textMuted },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 34, borderRadius: 999 },
  badgeText: { ...k.type.label },
  verdict: { ...k.type.bodyStrong, color: k.colors.text },
  group: { gap: 4 },
  groupTitle: { ...k.type.label, color: k.colors.textMuted },
  line: { ...k.type.body, color: k.colors.text },
  ok: { ...k.type.body, color: k.tint.green.fg },
});
