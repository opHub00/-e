import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import type { KioskOutcome } from '../evaluate';
import { k } from '../ui/theme';
import type { ExplanationTone, ListingExplanation } from './explain';
import { humanize } from '../presentation';

/**
 * 공고 상세의 설명 블록들. 모든 문구는 ListingExplanation 에서만 온다.
 * 판정 요약 → 조건(충족/부족/확인/서류) → 공식 점수 상태 → 순서 → 근거·출처.
 */
type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function Block({ title, icon, children, testID }: { title: string; icon: IconName; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.blockHead}>
        <MaterialIcons name={icon} size={26} color={k.colors.primary} />
        <Text style={styles.blockTitle} accessibilityRole="header">{title}</Text>
      </View>
      <View style={styles.blockBody}>{children}</View>
    </View>
  );
}

type LineTone = 'good' | 'bad' | 'warn' | 'doc' | 'plain';
const LINE_ICON: Record<LineTone, { icon: IconName; color: string }> = {
  good: { icon: 'check-circle', color: k.tint.green.fg },
  bad: { icon: 'cancel', color: k.colors.error },
  warn: { icon: 'help', color: k.tint.amber.fg },
  doc: { icon: 'description', color: k.colors.primary },
  plain: { icon: 'remove', color: k.colors.textMuted },
};

function Lines({ items, tone, testID }: { items: string[]; tone: LineTone; testID?: string }) {
  const { icon, color } = LINE_ICON[tone];
  return (
    <View style={styles.lines} testID={testID}>
      {items.map(item => (
        <View key={item} style={styles.line}>
          <MaterialIcons name={icon} size={22} color={color} />
          <Text style={styles.lineText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.subhead}>{title}{count === undefined ? '' : ` ${count}개`}</Text>
      {children}
    </View>
  );
}

const VERDICT_TONE: Record<ExplanationTone, { bg: string; fg: string; icon: IconName }> = {
  good: { bg: k.tint.green.bg, fg: k.tint.green.fg, icon: 'check-circle' },
  warn: { bg: k.tint.amber.bg, fg: k.tint.amber.fg, icon: 'help' },
  bad: { bg: k.tint.neutral.bg, fg: k.tint.neutral.fg, icon: 'remove-circle-outline' },
  neutral: { bg: k.tint.purple.bg, fg: k.tint.purple.fg, icon: 'info-outline' },
};

/** 결론 한 문장과 그 이유. 상세 화면 맨 위. */
export function VerdictSection({ explanation }: { explanation: ListingExplanation }) {
  const tone = VERDICT_TONE[explanation.verdict.tone];
  const reasonTitle = explanation.verdict.tone === 'good' ? '신청할 수 있는 이유'
    : explanation.verdict.tone === 'bad' ? '신청이 어려운 이유'
    : '먼저 확인할 것';
  return (
    <View style={[styles.verdict, { backgroundColor: tone.bg }]} testID="detail-why">
      <View style={styles.blockHead}>
        <MaterialIcons name={tone.icon} size={30} color={tone.fg} />
        <Text style={[styles.verdictTitle, { color: tone.fg }]} accessibilityRole="header">{explanation.verdict.title}</Text>
      </View>
      <Text style={styles.body}>{explanation.verdict.body}</Text>
      {explanation.reasons.length ? (
        <Group title={reasonTitle}>
          <Lines items={explanation.reasons} tone={explanation.verdict.tone === 'good' ? 'good' : explanation.verdict.tone === 'bad' ? 'bad' : 'warn'} />
        </Group>
      ) : null}
      {explanation.nextSteps.length ? (
        <Group title="다음에 할 일">
          <Lines items={explanation.nextSteps} tone="plain" />
        </Group>
      ) : null}
    </View>
  );
}

export function ConditionsSection({ explanation, outcome }: { explanation: ListingExplanation; outcome: KioskOutcome }) {
  if (!outcome.result) return null;
  const ineligible = outcome.status === 'INELIGIBLE';
  return (
    <Block title="조건 확인 결과" icon="checklist" testID="detail-conditions">
      <Group title="충족한 조건" count={explanation.satisfied.length}>
        {explanation.satisfied.length ? <Lines items={explanation.satisfied} tone="good" testID="detail-satisfied" /> : <Text style={styles.muted}>아직 충족을 확인한 조건이 없어요.</Text>}
      </Group>
      {explanation.unmet.length ? (
        <Group title="부족한 조건" count={explanation.unmet.length}>
          <Lines items={explanation.unmet} tone="bad" testID="detail-unmet" />
        </Group>
      ) : null}
      {/* 신청이 어렵다고 확정된 공급에서 '더 확인할 정보'를 앞세우면 결론이 흐려진다. 참고로만 둔다. */}
      {explanation.toConfirm.length ? (
        <Group title={ineligible ? '참고 · 확인하지 못한 정보' : '추가로 확인할 정보'} count={explanation.toConfirm.length}>
          <Lines items={explanation.toConfirm} tone="warn" testID="detail-to-confirm" />
        </Group>
      ) : null}
      {explanation.documents.length ? (
        <Group title="서류 확인 필요" count={explanation.documents.length}>
          <Text style={styles.muted}>말로 답할 수 없고 모집공고가 정한 증빙 서류로 확인하는 항목이에요.</Text>
          <Lines items={explanation.documents} tone="doc" testID="detail-documents" />
        </Group>
      ) : null}
      {!explanation.unmet.length && !explanation.toConfirm.length && !explanation.documents.length ? (
        <Text style={styles.muted}>부족하거나 더 확인할 조건이 없어요.</Text>
      ) : null}
      {explanation.notes.length ? (
        <Group title="함께 알아 둘 점">
          <Lines items={explanation.notes} tone="plain" />
        </Group>
      ) : null}
    </Block>
  );
}

export function ScoreSection({ explanation }: { explanation: ListingExplanation }) {
  const score = explanation.score;
  return (
    <Block title="공식 점수 상태" icon="gavel" testID="detail-score">
      <View style={styles.scoreHead}>
        <Text style={styles.scoreTitle} testID={`detail-score-${score.status.toLowerCase()}`}>{score.title}</Text>
      </View>
      <Text style={styles.body}>{score.body}</Text>
      {score.status === 'AVAILABLE' ? (
        <View>
          {score.items.map(item => (
            <View key={item.label} style={styles.row}>
              <Text style={[styles.lineText, { flex: 1 }]}>{item.label}</Text>
              <Text style={styles.points}>{item.points} / {item.max}점</Text>
            </View>
          ))}
          <View style={[styles.row, styles.rowTotal]}>
            <Text style={[styles.subhead, { flex: 1 }]}>합계</Text>
            <Text style={styles.points}>{score.total} / {score.max}점</Text>
          </View>
        </View>
      ) : null}
      {score.status === 'PENDING' && score.needs.length ? <Lines items={score.needs} tone="doc" /> : null}
      <Text style={styles.muted}>완판e 추천도는 비교를 돕는 별도 지표이고 공식 점수가 아니에요.</Text>
    </Block>
  );
}

export function OrderSection({ explanation, outcome }: { explanation: ListingExplanation; outcome: KioskOutcome }) {
  return (
    <Block title="왜 이 순서인가요?" icon="sort" testID="detail-order">
      <Text style={styles.body}>
        전체 결과 중 {outcome.rank}번째예요. 신청 가능 → 추가 확인 필요 → 신청 어려움 순서로 놓고, 같은 묶음에서는 완판e 추천도가 높은 공급을 앞에 둬요.
      </Text>
      <Group title="예상 순위">
        <Text style={styles.lineText}>{explanation.priority.label ? `${explanation.priority.label} · ` : ''}{explanation.priority.body}</Text>
      </Group>
      {outcome.wanpan.factors.length ? (
        <Group title="완판e 추천도에 반영된 것">
          {outcome.wanpan.factors.map(factor => (
            <View key={factor.label} style={styles.factor}>
              <Text style={[styles.lineText, { flex: 1 }]}>{humanize(factor.label)}</Text>
              <Text style={styles.factorEffect}>{factor.effect > 0 ? '▲ 앞으로' : factor.effect < 0 ? '▼ 뒤로' : '–'}</Text>
            </View>
          ))}
        </Group>
      ) : null}
    </Block>
  );
}

function openSource(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  else void Linking.openURL(url).catch(() => undefined);
}

export function SourcesSection({ explanation }: { explanation: ListingExplanation }) {
  const items = explanation.sources.slice(0, 8);
  const url = explanation.sources.find(item => item.url)?.url ?? null;
  return (
    <Block title="공고 원문 근거" icon="description" testID="detail-evidence">
      {items.length ? (
        <View style={styles.lines}>
          {items.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.evidence}>
              <Text style={styles.subhead}>{item.section}{item.page ? ` · ${item.page}쪽` : ''}</Text>
              <Text style={styles.lineText}>{item.title}</Text>
              {item.excerpt ? <Text style={styles.excerpt} numberOfLines={4}>“{item.excerpt}”</Text> : null}
            </View>
          ))}
          {explanation.sources.length > items.length ? <Text style={styles.muted}>외 {explanation.sources.length - items.length}개 조항</Text> : null}
        </View>
      ) : <Text style={styles.muted}>연결된 공고 원문 근거가 없어요.</Text>}
      {url ? (
        <MotionPressable accessibilityRole="link" accessibilityLabel="모집공고 원문 열기" onPress={() => openSource(url)} style={styles.sourceLink} testID="detail-source-link">
          <MaterialIcons name="open-in-new" size={22} color={k.colors.primary} />
          <Text style={styles.sourceLinkText}>모집공고 원문 열기</Text>
        </MotionPressable>
      ) : null}
    </Block>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: k.colors.surface, borderRadius: 20, padding: 24, gap: 14, borderWidth: 1, borderColor: k.colors.outline },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockTitle: { ...k.type.section, color: k.colors.text },
  blockBody: { gap: 16 },
  verdict: { borderRadius: 20, padding: 24, gap: 14 },
  verdictTitle: { ...k.type.title },
  body: { ...k.type.bodyLg, color: k.colors.text },
  muted: { ...k.type.body, color: k.colors.textMuted },
  group: { gap: 8 },
  subhead: { ...k.type.bodyStrong, color: k.colors.textMuted },
  lines: { gap: 10 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  lineText: { ...k.type.body, color: k.colors.text, flexShrink: 1 },
  scoreHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreTitle: { ...k.type.title, color: k.colors.text },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: k.colors.hairline, alignItems: 'center' },
  rowTotal: { borderBottomWidth: 0 },
  points: { ...k.type.bodyLgStrong, color: k.colors.text },
  factor: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  factorEffect: { ...k.type.bodyStrong, color: k.colors.primary },
  evidence: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  excerpt: { ...k.type.caption, color: k.colors.textMuted, fontStyle: 'italic' },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: k.touch, paddingHorizontal: 18, borderRadius: 12, backgroundColor: k.colors.primaryFixed, alignSelf: 'flex-start' },
  sourceLinkText: { ...k.type.bodyStrong, color: k.colors.primary },
});
