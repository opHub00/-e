import { MaterialIcons } from '@expo/vector-icons';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { bucketTone, k } from '../ui/theme';
import type { StoryData, StoryTone } from './storyData';

/**
 * 장면 그림. 모두 480×380 짜리 논리 무대 위에 절대 위치로 그리고, 바깥(ProductStory)이 화면 크기에 맞게 확대·축소한다.
 * 그래서 iPad·데스크톱·휴대폰에서 같은 구도가 유지된다.
 *
 * 각 장면은 0→1 로 가는 progress 하나만 받는다. reduced motion 이면 처음부터 1 이라 완성된 그림만 보인다.
 * 움직임은 opacity·짧은 이동·선이 자라는 것뿐이다. 회전·튀는 효과는 쓰지 않는다(공공 서비스 톤).
 */
export const STAGE = { width: 480, height: 380 } as const;

type P = Animated.Value;
type SceneProps = { p: P; data: StoryData };
type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type Src = Animated.Value | Animated.AnimatedInterpolation<string | number>;

/** progress 의 [from, to] 구간에서 0→1. 구간 밖은 고정. */
const seg = (p: Src, from: number, to: number) => p.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' });
const mix = (p: Src, from: number, to: number, a: number, b: number) =>
  p.interpolate({ inputRange: [from, to], outputRange: [a, b], extrapolate: 'clamp' });
/** 나타나기: 투명 → 보임, 아래에서 살짝 올라온다. */
const rise = (v: Src, distance = 10) => ({ opacity: v, transform: [{ translateY: mix(v, 0, 1, distance, 0) }] });

const TONE: Record<StoryTone, { bg: string; fg: string; icon: IconName }> = {
  eligible: { bg: bucketTone.eligible.bg, fg: bucketTone.eligible.fg, icon: 'check-circle' },
  review: { bg: bucketTone.review.bg, fg: bucketTone.review.fg, icon: 'help' },
  difficult: { bg: bucketTone.difficult.bg, fg: bucketTone.difficult.fg, icon: 'remove-circle-outline' },
};

/** 선이 한쪽 끝에서부터 자란다(가로). */
function HLine({ v, left, top, width }: { v: Src; left: number; top: number; width: number }) {
  return (
    <Animated.View
      style={[styles.abs, styles.line, { left, top, width, opacity: mix(v, 0, 0.2, 0, 1), transform: [{ translateX: mix(v, 0, 1, -width / 2, 0) }, { scaleX: v }] }]}
    />
  );
}

function VLine({ v, left, top, height }: { v: Src; left: number; top: number; height: number }) {
  return (
    <Animated.View
      style={[styles.abs, styles.vline, { left, top, height, opacity: mix(v, 0, 0.2, 0, 1), transform: [{ translateY: mix(v, 0, 1, -height / 2, 0) }, { scaleY: v }] }]}
    />
  );
}

/** Scene 1 — 공고문 하나 아래로 다섯 신청유형이 펼쳐진다. */
export function SceneSupplies({ p, data }: SceneProps) {
  const doc = seg(p, 0, 0.25);
  const stem = seg(p, 0.18, 0.32);
  const bar = seg(p, 0.26, 0.45);
  const cardW = 84;
  const gap = 8;
  const left0 = (STAGE.width - (cardW * 5 + gap * 4)) / 2;
  const centers = data.supplies.map((_, index) => left0 + index * (cardW + gap) + cardW / 2);
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.doc, { left: 130, top: 6, width: 220 }, rise(doc)]}>
        <View style={styles.docIcon}><MaterialIcons name="description" size={20} color={k.colors.primary} /></View>
        <View style={styles.flex}>
          <Text style={styles.caption}>입주자모집공고</Text>
          <Text style={styles.docTitle} numberOfLines={1}>{data.region}</Text>
          <Text style={styles.caption} numberOfLines={1}>{data.meta}</Text>
        </View>
      </Animated.View>
      <VLine v={stem} left={STAGE.width / 2 - 1} top={86} height={30} />
      <HLine v={bar} left={centers[0]} top={116} width={centers[centers.length - 1] - centers[0]} />
      {data.supplies.map((supply, index) => {
        const drop = seg(p, 0.36 + index * 0.08, 0.56 + index * 0.08);
        const appear = seg(p, 0.42 + index * 0.08, 0.66 + index * 0.08);
        return (
          <View key={supply.type} style={StyleSheet.absoluteFill} pointerEvents="none">
            <VLine v={drop} left={centers[index] - 1} top={116} height={22} />
            <Animated.View style={[styles.abs, styles.supply, { left: centers[index] - cardW / 2, top: 140, width: cardW }, rise(appear, 12)]}>
              <View style={styles.supplyIcon}><MaterialIcons name={supply.icon as IconName} size={22} color={k.colors.primary} /></View>
              <Text style={styles.supplyName} numberOfLines={1}>{supply.short}</Text>
              <Text style={styles.supplyCount}>{supply.count}세대</Text>
            </Animated.View>
          </View>
        );
      })}
      {/* 특별공급(앞 네 유형)·일반공급 합계. 공고 공급 내역(규칙 패키지 inventory) 그대로. */}
      {(() => {
        const groups = seg(p, 0.76, 0.92);
        const specialLeft = centers[0] - cardW / 2;
        const specialWidth = centers[3] + cardW / 2 - specialLeft;
        const generalLeft = centers[4] - cardW / 2;
        return (
          <>
            <Animated.View testID="story-total-special" style={[styles.abs, styles.group, { left: specialLeft, top: 262, width: specialWidth }, { opacity: groups }]}>
              <Text style={styles.groupText}>특별공급 {data.totals.special}세대</Text>
            </Animated.View>
            <Animated.View testID="story-total-general" style={[styles.abs, styles.group, { left: generalLeft, top: 262, width: cardW }, { opacity: groups }]}>
              <Text style={styles.groupText}>일반공급 {data.totals.general}세대</Text>
            </Animated.View>
          </>
        );
      })()}
      <Animated.View style={[styles.abs, styles.noteRow, { left: 40, top: 312, width: 400 }, rise(seg(p, 0.86, 1), 6)]}>
        <MaterialIcons name="info-outline" size={18} color={k.colors.textMuted} />
        <Text style={styles.note}>유형마다 자격 기준과 선정 방식이 달라요</Text>
      </Animated.View>
    </View>
  );
}

/** Scene 2 — 내 조건 일곱 가지가 나타나고, 그것이 자격과 순위를 정한다. */
export function SceneConditions({ p, data }: SceneProps) {
  const chipW = 110;
  const gap = 10;
  const rowLeft = (count: number) => (STAGE.width - (chipW * count + gap * (count - 1))) / 2;
  const outcome = seg(p, 0.72, 0.92);
  const arrows = seg(p, 0.62, 0.78);
  return (
    <View style={styles.stage}>
      {data.conditions.map((condition, index) => {
        const row = index < 4 ? 0 : 1;
        const col = row === 0 ? index : index - 4;
        const left = rowLeft(row === 0 ? 4 : 3) + col * (chipW + gap);
        const appear = seg(p, 0.04 + index * 0.075, 0.26 + index * 0.075);
        return (
          <Animated.View key={condition.label} style={[styles.abs, styles.condition, { left, top: 14 + row * 58, width: chipW }, rise(appear, 8)]}>
            <View style={styles.conditionIcon}><MaterialIcons name={condition.icon as IconName} size={18} color={k.colors.primary} /></View>
            <Text style={styles.conditionLabel}>{condition.label}</Text>
          </Animated.View>
        );
      })}
      {[150, 330].map(x => (
        <Animated.View key={x} style={[styles.abs, { left: x - 12, top: 132, opacity: arrows, transform: [{ translateY: mix(arrows, 0, 1, -6, 0) }] }]}>
          <MaterialIcons name="south" size={24} color={k.colors.textSubtle} />
        </Animated.View>
      ))}
      <Animated.View style={[styles.abs, styles.outcome, { left: 30, top: 170, width: 204 }, rise(outcome, 10)]}>
        <View style={styles.outcomeHead}><MaterialIcons name="verified" size={20} color={k.colors.primary} /><Text style={styles.outcomeTitle}>자격</Text></View>
        <Text style={styles.caption}>유형별 신청 가능 여부</Text>
        <View style={styles.miniBadges}>
          {(['eligible', 'review', 'difficult'] as const).map(tone => (
            <View key={tone} style={[styles.miniBadge, { backgroundColor: TONE[tone].bg }]}>
              <Text style={[styles.miniBadgeText, { color: TONE[tone].fg }]}>{tone === 'eligible' ? '가능' : tone === 'review' ? '확인' : '어려움'}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[styles.abs, styles.outcome, { left: 246, top: 170, width: 204 }, rise(seg(p, 0.78, 0.98), 10)]}>
        <View style={styles.outcomeHead}><MaterialIcons name="format-list-numbered" size={20} color={k.colors.primary} /><Text style={styles.outcomeTitle}>순위</Text></View>
        <Text style={styles.caption}>공급 단계 · 공식 가점</Text>
        <View style={styles.stageBars}>
          {['1단계', '2단계', '3단계'].map((label, index) => (
            <View key={label} style={styles.stageBarRow}>
              <Text style={styles.stageBarLabel}>{label}</Text>
              <View style={styles.stageTrack}><View style={[styles.stageFill, { width: `${[70, 20, 10][index]}%` }]} /></View>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

/** Scene 3 — 공고문 → 조건 추출 → 내 정보와 비교. */
export function SceneCheck({ p, data }: SceneProps) {
  const docV = seg(p, 0, 0.18);
  const arrow1 = seg(p, 0.14, 0.28);
  const arrow2 = seg(p, 0.56, 0.68);
  const top = 24;
  const rowY = (index: number) => top + 52 + index * 46;
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.column, { left: 4, top, width: 130, height: 262 }, rise(docV)]}>
        <View style={styles.columnHead}><MaterialIcons name="description" size={18} color={k.colors.primary} /><Text style={styles.columnTitle}>공고문</Text></View>
        <Text style={styles.caption} numberOfLines={1}>{data.region}</Text>
        {[0.9, 0.7, 0.85, 0.6, 0.8, 0.5, 0.75].map((w, index) => (
          <View key={index} style={[styles.textLine, { width: `${w * 100}%` }]} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.abs, { left: 138, top: top + 118, opacity: arrow1, transform: [{ translateX: mix(arrow1, 0, 1, -8, 0) }] }]}>
        <MaterialIcons name="east" size={26} color={k.colors.primary} />
      </Animated.View>
      <Animated.View style={[styles.abs, styles.column, { left: 168, top, width: 168, height: 262 }, { opacity: seg(p, 0.2, 0.32) }]}>
        <View style={styles.columnHead}><MaterialIcons name="checklist" size={18} color={k.colors.primary} /><Text style={styles.columnTitle}>조건 추출</Text></View>
      </Animated.View>
      {data.criteria.map((criterion, index) => {
        const pick = seg(p, 0.26 + index * 0.08, 0.42 + index * 0.08);
        const verdict = seg(p, 0.66 + index * 0.07, 0.8 + index * 0.07);
        const pending = index === data.criteria.length - 1;
        return (
          <View key={criterion} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Animated.View style={[styles.abs, styles.criterion, { left: 176, top: rowY(index), width: 152 }, { opacity: pick, transform: [{ translateX: mix(pick, 0, 1, -10, 0) }] }]}>
              <Text style={styles.criterionText} numberOfLines={1}>{criterion}</Text>
            </Animated.View>
            <Animated.View style={[styles.abs, styles.verdict, { left: 384, top: rowY(index), backgroundColor: pending ? TONE.review.bg : TONE.eligible.bg }, { opacity: verdict }]}>
              <MaterialIcons name={pending ? 'help' : 'check-circle'} size={16} color={pending ? TONE.review.fg : TONE.eligible.fg} />
              <Text style={[styles.verdictText, { color: pending ? TONE.review.fg : TONE.eligible.fg }]}>{pending ? '확인' : '충족'}</Text>
            </Animated.View>
          </View>
        );
      })}
      <Animated.View style={[styles.abs, { left: 340, top: top + 118, opacity: arrow2, transform: [{ translateX: mix(arrow2, 0, 1, -8, 0) }] }]}>
        <MaterialIcons name="east" size={26} color={k.colors.primary} />
      </Animated.View>
      <Animated.View style={[styles.abs, styles.columnHeadFloat, { left: 372, top: top + 10, opacity: seg(p, 0.6, 0.72) }]}>
        <MaterialIcons name="person-outline" size={18} color={k.colors.primary} />
        <Text style={styles.columnTitle}>내 정보</Text>
      </Animated.View>
      <Animated.View style={[styles.abs, styles.noteRow, { left: 40, top: 300, width: 400 }, rise(seg(p, 0.86, 1), 6)]}>
        <MaterialIcons name="fact-check" size={18} color={k.colors.textMuted} />
        <Text style={styles.note}>공고문 원문 기준으로 조건마다 비교해요</Text>
      </Animated.View>
    </View>
  );
}

/** Scene 4 — 다섯 유형 카드에 판정이 차례로 붙는다(예시). */
export function SceneCompare({ p, data }: SceneProps) {
  const settle = seg(p, 0.82, 1);
  return (
    <View style={styles.stage}>
      {data.compare.map((row, index) => {
        const tone = TONE[row.status];
        const card = seg(p, index * 0.05, 0.2 + index * 0.05);
        const judged = seg(p, 0.22 + index * 0.12, 0.36 + index * 0.12);
        const eligible = row.status === 'eligible';
        return (
          <Animated.View
            key={row.short}
            style={[
              styles.abs,
              styles.compareRow,
              { left: 40, top: 8 + index * 58, width: 400 },
              { opacity: card },
            ]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, styles.compareAccent, { borderColor: k.colors.primary, opacity: eligible ? settle : 0 }]} />
            {/* 판정이 끝나면 신청 가능한 유형은 테두리로 강조하고, 어려운 유형은 조금 흐리게. */}
            <Animated.Text style={[styles.compareName, { opacity: row.status === 'difficult' ? mix(settle, 0, 1, 1, 0.55) : 1 }]}>{row.short}</Animated.Text>
            <Animated.View style={[styles.compareBadge, { backgroundColor: tone.bg, opacity: judged, transform: [{ translateX: mix(judged, 0, 1, 8, 0) }] }]}>
              <MaterialIcons name={tone.icon} size={16} color={tone.fg} />
              <Text style={[styles.compareBadgeText, { color: tone.fg }]}>{row.label}</Text>
            </Animated.View>
          </Animated.View>
        );
      })}
      <Animated.Text style={[styles.abs, styles.exampleNote, { left: 40, top: 304, width: 400, opacity: seg(p, 0.85, 1) }]}>
        예시 화면 · 실제 판정은 입력한 조건으로 계산해요
      </Animated.Text>
    </View>
  );
}

/** Scene 5 — 추천 유형 · 공식 가점 · 자격 기준 · 접수일(예시). */
export function SceneResult({ p, data }: SceneProps) {
  const card = seg(p, 0, 0.35);
  const score = seg(p, 0.3, 0.7);
  const { example } = data;
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.result, { left: 40, top: 4, width: 400 }, { opacity: card, transform: [{ translateY: mix(card, 0, 1, 12, 0) }] }]}>
        <View style={styles.resultTop}>
          <View style={styles.eyebrow}><MaterialIcons name="star" size={14} color={k.colors.onPrimary} /><Text style={styles.eyebrowText}>가장 유리한 신청유형</Text></View>
          <Text style={styles.exampleTag}>예시</Text>
        </View>
        <Text style={styles.resultTitle}>{example.supplyLabel}</Text>
        <View style={styles.resultChips}>
          <View style={[styles.resultChip, { backgroundColor: TONE.eligible.bg }]}><Text style={[styles.resultChipText, { color: TONE.eligible.fg }]}>신청 가능</Text></View>
          <View style={styles.resultChip}><Text style={styles.resultChipText}>{example.stage}</Text></View>
        </View>
        <Animated.View style={[styles.scoreBlock, { opacity: seg(p, 0.25, 0.45) }]}>
          <View style={styles.scoreHead}>
            <Text style={styles.scoreLabel}>공식 가점</Text>
            <Text style={styles.scoreValue}>{example.score.total}<Text style={styles.scoreMax}> / {example.score.max}점</Text></Text>
          </View>
          <View style={styles.scoreTrack}>
            <Animated.View style={[styles.scoreFill, { width: score.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.round((example.score.total / example.score.max) * 100)}%`] }) }]} />
          </View>
        </Animated.View>
        <View style={styles.reasons}>
          {example.reasons.map((reason, index) => (
            <Animated.View key={reason} style={[styles.reason, rise(seg(p, 0.5 + index * 0.1, 0.68 + index * 0.1), 6)]}>
              <View style={styles.checkDot}><MaterialIcons name="check" size={12} color={k.colors.onPrimary} /></View>
              <Text style={styles.reasonText}>{reason}</Text>
            </Animated.View>
          ))}
        </View>
        <Animated.View style={[styles.dateRow, { opacity: seg(p, 0.8, 1) }]}>
          <View style={styles.dateLine}>
            <MaterialIcons name="event" size={18} color={k.colors.primary} />
            <Text style={styles.dateText} testID="story-date-special">특별공급 접수 {example.date}</Text>
          </View>
          <View style={styles.dateLine}>
            <MaterialIcons name="campaign" size={18} color={k.colors.textMuted} />
            <Text style={styles.dateMuted} testID="story-date-winner">당첨자 발표 {example.winnerAnnouncement}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const card = { backgroundColor: k.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: k.colors.surfaceHigh } as const;

const styles = StyleSheet.create({
  stage: { width: STAGE.width, height: STAGE.height },
  abs: { position: 'absolute' },
  flex: { flex: 1, minWidth: 0 },
  line: { height: 2, borderRadius: 1, backgroundColor: k.colors.primary },
  vline: { width: 2, borderRadius: 1, backgroundColor: k.colors.primary },
  caption: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted },
  note: { fontFamily: k.type.label.fontFamily, fontSize: 14, lineHeight: 20, color: k.colors.textMuted },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  doc: { ...card, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderColor: k.colors.primary, borderWidth: 2 },
  docIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontFamily: k.type.section.fontFamily, fontSize: 17, lineHeight: 23, color: k.colors.text },
  supply: { ...card, alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 4 },
  supplyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  supplyName: { fontFamily: k.type.label.fontFamily, fontSize: 14, lineHeight: 19, color: k.colors.text },
  supplyCount: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted },
  condition: { ...card, flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 8 },
  conditionIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  conditionLabel: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text, flexShrink: 0 },
  outcome: { ...card, padding: 14, gap: 6, borderColor: k.colors.primary },
  outcomeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outcomeTitle: { fontFamily: k.type.section.fontFamily, fontSize: 17, lineHeight: 23, color: k.colors.text },
  miniBadges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  miniBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  miniBadgeText: { fontFamily: k.type.label.fontFamily, fontSize: 12 },
  stageBars: { gap: 5, marginTop: 4 },
  stageBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageBarLabel: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted, width: 34 },
  stageTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: k.colors.surfaceHighest, overflow: 'hidden' },
  stageFill: { height: 6, borderRadius: 3, backgroundColor: k.colors.primary },
  column: { ...card, padding: 12, gap: 8 },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  columnHeadFloat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  columnTitle: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text },
  textLine: { height: 6, borderRadius: 3, backgroundColor: k.colors.surfaceHigh },
  criterion: { height: 36, borderRadius: 10, backgroundColor: k.colors.primaryFixed, paddingHorizontal: 10, justifyContent: 'center' },
  criterionText: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.primary },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 10 },
  verdictText: { fontFamily: k.type.label.fontFamily, fontSize: 13 },
  compareRow: { ...card, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  compareAccent: { borderRadius: 14, borderWidth: 2 },
  compareName: { fontFamily: k.type.label.fontFamily, fontSize: 16, color: k.colors.text },
  compareBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  compareBadgeText: { fontFamily: k.type.label.fontFamily, fontSize: 13 },
  exampleNote: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted, textAlign: 'center' },
  result: { ...card, borderRadius: 18, borderWidth: 2, borderColor: k.colors.primary, padding: 14, gap: 8 },
  resultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: k.colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  eyebrowText: { fontFamily: k.type.label.fontFamily, fontSize: 12, color: k.colors.onPrimary },
  exampleTag: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  resultTitle: { fontFamily: k.type.section.fontFamily, fontSize: 22, lineHeight: 30, color: k.colors.text },
  resultChips: { flexDirection: 'row', gap: 6 },
  resultChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: k.colors.surfaceContainer },
  resultChipText: { fontFamily: k.type.label.fontFamily, fontSize: 12, color: k.colors.text },
  scoreBlock: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: k.colors.surfaceLow },
  scoreHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  scoreLabel: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.textMuted },
  scoreValue: { fontFamily: k.type.section.fontFamily, fontSize: 18, color: k.colors.text },
  scoreMax: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  scoreTrack: { height: 8, borderRadius: 4, backgroundColor: k.colors.surfaceHighest, overflow: 'hidden' },
  scoreFill: { height: 8, borderRadius: 4, backgroundColor: k.colors.primary },
  reasons: { gap: 6 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: k.colors.success, alignItems: 'center', justifyContent: 'center' },
  reasonText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text },
  dateRow: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateMuted: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.textMuted },
  group: { borderTopWidth: 2, borderTopColor: k.colors.primary, paddingTop: 6, alignItems: 'center' },
  groupText: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.primary },
  dateText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.primary },
});
