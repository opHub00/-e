import { MaterialIcons } from '@expo/vector-icons';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { bucketTone, k } from '../ui/theme';
import type { StoryData, StoryDistrict, StoryTone } from './storyData';
import { storyShortDate } from './storyData';

/**
 * 장면 그림. 모두 480×380 짜리 논리 무대 위에 절대 위치로 그리고, 바깥(ProductStory)이 화면 크기에 맞게 확대·축소한다.
 * 각 장면은 0→1 로 가는 progress 하나만 받는다. reduced motion 이면 처음부터 1 이라 완성된 그림만 보인다.
 * 움직임은 opacity·짧은 이동·선이 자라는 것뿐이다(공공 서비스 톤). 1지구=보라, 2지구=초록으로 늘 같은 색을 쓴다.
 */
export const STAGE = { width: 480, height: 380 } as const;

type P = Animated.Value;
type SceneProps = { p: P; data: StoryData };
type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type Src = Animated.Value | Animated.AnimatedInterpolation<string | number>;

const seg = (p: Src, from: number, to: number) => p.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' });
const mix = (p: Src, from: number, to: number, a: number, b: number) =>
  p.interpolate({ inputRange: [from, to], outputRange: [a, b], extrapolate: 'clamp' });
const rise = (v: Src, distance = 10) => ({ opacity: v, transform: [{ translateY: mix(v, 0, 1, distance, 0) }] });

const TONE: Record<StoryTone, { bg: string; fg: string; icon: IconName }> = {
  eligible: { bg: bucketTone.eligible.bg, fg: bucketTone.eligible.fg, icon: 'check-circle' },
  review: { bg: bucketTone.review.bg, fg: bucketTone.review.fg, icon: 'help' },
  difficult: { bg: bucketTone.difficult.bg, fg: bucketTone.difficult.fg, icon: 'remove-circle-outline' },
};
const DISTRICT_COLOR = { D1: k.colors.primary, D2: k.colors.success } as const;

function HLine({ v, left, top, width }: { v: Src; left: number; top: number; width: number }) {
  return <Animated.View style={[styles.abs, styles.line, { left, top, width, opacity: mix(v, 0, 0.2, 0, 1), transform: [{ translateX: mix(v, 0, 1, -width / 2, 0) }, { scaleX: v }] }]} />;
}
function VLine({ v, left, top, height }: { v: Src; left: number; top: number; height: number }) {
  return <Animated.View style={[styles.abs, styles.vline, { left, top, height, opacity: mix(v, 0, 0.2, 0, 1), transform: [{ translateY: mix(v, 0, 1, -height / 2, 0) }, { scaleY: v }] }]} />;
}
function Pill({ district }: { district: StoryDistrict }) {
  return <View style={[styles.pill, { backgroundColor: DISTRICT_COLOR[district.id] }]}><Text style={styles.pillText}>{district.label}</Text></View>;
}

/** Scene 1 — 삼도이동 아래 1지구 · 2지구. */
export function SceneDistricts({ p, data }: SceneProps) {
  const head = seg(p, 0, 0.25);
  const stem = seg(p, 0.2, 0.34);
  const bar = seg(p, 0.3, 0.46);
  const centers = [124, 356];
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.headCard, { left: 110, top: 8, width: 260 }, rise(head)]}>
        <View style={styles.headIcon}><MaterialIcons name="location-city" size={20} color={k.colors.primary} /></View>
        <View style={styles.flex}>
          <Text style={styles.caption}>제주시 삼도이동</Text>
          <Text style={styles.headTitle} numberOfLines={2}>토지임대부 분양주택</Text>
        </View>
      </Animated.View>
      <VLine v={stem} left={STAGE.width / 2 - 1} top={84} height={30} />
      <HLine v={bar} left={centers[0]} top={114} width={centers[1] - centers[0]} />
      {data.districts.map((district, index) => {
        const drop = seg(p, 0.42 + index * 0.12, 0.58 + index * 0.12);
        const appear = seg(p, 0.48 + index * 0.12, 0.72 + index * 0.12);
        const inv = district.inventory;
        return (
          <View key={district.id} style={StyleSheet.absoluteFill} pointerEvents="none">
            <VLine v={drop} left={centers[index] - 1} top={114} height={24} />
            <Animated.View testID={`story-district-${district.id}`} style={[styles.abs, styles.district, { left: centers[index] - 100, top: 140, width: 200, borderTopColor: DISTRICT_COLOR[district.id] }, rise(appear, 12)]}>
              <Pill district={district} />
              <Text style={styles.districtTotal}>{inv ? `총 ${inv.total}세대` : '공고 확인 중'}</Text>
              {inv ? (
                <View style={styles.unitRow}>
                  <View style={styles.unit}><Text style={styles.unitLabel}>49㎡</Text><Text style={styles.unitValue}>{inv.units49}세대</Text></View>
                  <View style={styles.unit}><Text style={styles.unitLabel}>59㎡</Text><Text style={styles.unitValue}>{inv.units59}세대</Text></View>
                </View>
              ) : null}
            </Animated.View>
          </View>
        );
      })}
      <Animated.View style={[styles.abs, styles.noteRow, { left: 40, top: 318, width: 400 }, rise(seg(p, 0.84, 1), 6)]}>
        <MaterialIcons name="info-outline" size={18} color={k.colors.textMuted} />
        <Text style={styles.note}>지구마다 공급 규모와 조건이 달라요</Text>
      </Animated.View>
    </View>
  );
}

/** Scene 2 — 조건 일곱 가지가 한 장의 '내 조건' 카드로. */
export function SceneProfile({ p, data }: SceneProps) {
  const card = seg(p, 0.62, 0.86);
  return (
    <View style={styles.stage}>
      {data.conditions.map((condition, index) => {
        const row = index < 4 ? 0 : 1;
        const col = row === 0 ? index : index - 4;
        const left = (row === 0 ? 15 : 74) + col * 118;
        const appear = seg(p, 0.04 + index * 0.07, 0.24 + index * 0.07);
        return (
          <Animated.View key={condition.label} style={[styles.abs, styles.condition, { left, top: 10 + row * 56, width: 110 }, rise(appear, 8)]}>
            <View style={styles.conditionIcon}><MaterialIcons name={condition.icon as IconName} size={17} color={k.colors.primary} /></View>
            <Text style={styles.conditionLabel}>{condition.label}</Text>
          </Animated.View>
        );
      })}
      <Animated.View style={[styles.abs, { left: 228, top: 130, opacity: seg(p, 0.52, 0.66) }]}>
        <MaterialIcons name="south" size={24} color={k.colors.textSubtle} />
      </Animated.View>
      <Animated.View style={[styles.abs, styles.profile, { left: 110, top: 168, width: 260 }, rise(card, 12)]}>
        <View style={styles.profileHead}>
          <View style={styles.avatar}><MaterialIcons name="person" size={22} color={k.colors.onPrimary} /></View>
          <View style={styles.flex}>
            <Text style={styles.profileTitle}>내 조건</Text>
            <Text style={styles.caption}>{data.conditions.length}가지 · 한 번 입력</Text>
          </View>
          <View style={styles.onceTag}><Text style={styles.onceText}>1회 입력</Text></View>
        </View>
        <View style={styles.dots}>{data.conditions.map(condition => <View key={condition.label} style={styles.dot} />)}</View>
      </Animated.View>
      <Animated.View style={[styles.abs, styles.noteRow, { left: 40, top: 318, width: 400 }, rise(seg(p, 0.86, 1), 6)]}>
        <MaterialIcons name="lock-outline" size={18} color={k.colors.textMuted} />
        <Text style={styles.note}>입력한 정보는 이 기기에 저장하지 않아요</Text>
      </Animated.View>
    </View>
  );
}

/** Scene 3 — 내 조건 하나에서 1지구 · 2지구로 갈라져, 지구마다 신청유형을 하나씩 확인. */
export function SceneCheck({ p, data }: SceneProps) {
  const profile = seg(p, 0, 0.16);
  const stem = seg(p, 0.12, 0.24);
  const bar = seg(p, 0.2, 0.34);
  const centers = [128, 352];
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.profileDock, styles.profileRow, { left: 150, top: 4, width: 180 }, rise(profile)]}>
        <View style={styles.avatarSmall}><MaterialIcons name="person" size={18} color={k.colors.onPrimary} /></View>
        <View style={styles.flex}>
          <Text style={styles.profileTitle}>내 조건</Text>
          <Text style={styles.caption}>한 번 입력</Text>
        </View>
      </Animated.View>
      <VLine v={stem} left={STAGE.width / 2 - 1} top={62} height={22} />
      <HLine v={bar} left={centers[0]} top={84} width={centers[1] - centers[0]} />
      {data.districts.map((district, ci) => {
        const drop = seg(p, 0.3 + ci * 0.05, 0.4 + ci * 0.05);
        const head = seg(p, 0.34 + ci * 0.05, 0.46 + ci * 0.05);
        const left = centers[ci] - 100;
        return (
          <View key={district.id} style={StyleSheet.absoluteFill} pointerEvents="none">
            <VLine v={drop} left={centers[ci] - 1} top={84} height={18} />
            <Animated.View style={[styles.abs, styles.checkColumn, { left, top: 102, width: 200, borderTopColor: DISTRICT_COLOR[district.id] }, { opacity: head }]}>
              <Pill district={district} />
            </Animated.View>
            {data.supplies.map((supply, si) => {
              const tick = seg(p, 0.42 + ci * 0.05 + si * 0.08, 0.54 + ci * 0.05 + si * 0.08);
              const col = si % 2;
              const row = Math.floor(si / 2);
              return (
                <Animated.View key={supply.type} style={[styles.abs, styles.checkRow, { left: left + 10 + col * 92, top: 142 + row * 42, width: 88 }, { opacity: tick, transform: [{ translateY: mix(tick, 0, 1, 4, 0) }] }]}>
                  <MaterialIcons name="check" size={15} color={DISTRICT_COLOR[district.id]} />
                  <Text style={styles.checkText} numberOfLines={1}>{supply.short}</Text>
                </Animated.View>
              );
            })}
          </View>
        );
      })}
      <Animated.View style={[styles.abs, styles.noteRow, { left: 40, top: 300, width: 400 }, rise(seg(p, 0.9, 1), 6)]}>
        <MaterialIcons name="fact-check" size={18} color={k.colors.textMuted} />
        <Text style={styles.note}>지구별 공고 기준으로 따로 확인해요</Text>
      </Animated.View>
    </View>
  );
}

/** Scene 4 — 두 칸 비교(자격 · 우선단계 · 공급세대 · 분양가·토지임대료), 예시. */
export function SceneCompare({ p, data }: SceneProps) {
  const rows: { label: string; render: (index: number) => React.ReactNode }[] = [
    {
      label: '자격',
      render: index => {
        const row = data.compare[index];
        const tone = TONE[row.eligibility.tone];
        return <View style={[styles.badge, { backgroundColor: tone.bg }]}><MaterialIcons name={tone.icon} size={14} color={tone.fg} /><Text style={[styles.badgeText, { color: tone.fg }]}>{row.eligibility.label}</Text></View>;
      },
    },
    { label: '우선단계', render: index => <Text style={styles.cellText}>{data.compare[index].stage}</Text> },
    { label: '공급세대', render: index => <Text style={styles.cellText}>{data.districts[index]?.inventory ? `총 ${data.districts[index].inventory!.total}세대` : '공고 확인'}</Text> },
    { label: '분양가·임대료', render: () => <Text style={styles.cellMuted}>공고 금액 비교</Text> },
  ];
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.tableHead, { left: 20, top: 8, width: 440 }, { opacity: seg(p, 0, 0.18) }]}>
        <Text style={[styles.th, { width: 110 }]}>항목</Text>
        {data.districts.map(district => <View key={district.id} style={styles.thCell}><Pill district={district} /></View>)}
      </Animated.View>
      {rows.map((row, ri) => {
        const show = seg(p, 0.16 + ri * 0.15, 0.34 + ri * 0.15);
        return (
          <Animated.View key={row.label} style={[styles.abs, styles.tableRow, { left: 20, top: 58 + ri * 56, width: 440 }, rise(show, 6)]}>
            <Text style={[styles.th, { width: 110 }]}>{row.label}</Text>
            {data.districts.map((district, di) => <View key={district.id} style={styles.thCell}>{row.render(di)}</View>)}
          </Animated.View>
        );
      })}
      <Animated.Text style={[styles.abs, styles.exampleNote, { left: 40, top: 300, width: 400, opacity: seg(p, 0.85, 1) }]}>
        예시 화면 · 순위가 아니라 조건을 나란히 보여드려요
      </Animated.Text>
    </View>
  );
}

/** Scene 5 — 지구별 선택지 카드 + 신청 일정, 예시. */
export function SceneResult({ p, data }: SceneProps) {
  const scheduleRows: { label: string; key: keyof StoryDistrict['schedule'] }[] = [
    { label: '특별공급', key: 'special' },
    { label: '일반 1순위', key: 'generalFirst' },
    { label: '일반 2순위', key: 'generalSecond' },
    { label: '당첨자 발표', key: 'winnerAnnouncement' },
  ];
  return (
    <View style={styles.stage}>
      <View style={[styles.abs, styles.choiceRow, { left: 20, top: 4, width: 440 }]}>
        {data.choices.map((choice, index) => {
          const district = data.districts.find(item => item.id === choice.district)!;
          const tone = TONE[choice.status.tone];
          return (
            <Animated.View key={choice.district} style={[styles.choice, { borderTopColor: DISTRICT_COLOR[choice.district] }, rise(seg(p, index * 0.1, 0.3 + index * 0.1), 10)]}>
              <View style={styles.choiceHead}><Pill district={district} /><Text style={styles.exampleTag}>예시</Text></View>
              <Text style={styles.choiceTitle} numberOfLines={1}>{choice.supply}</Text>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}><MaterialIcons name={tone.icon} size={14} color={tone.fg} /><Text style={[styles.badgeText, { color: tone.fg }]}>{choice.status.label}</Text></View>
            </Animated.View>
          );
        })}
      </View>
      <Animated.View style={[styles.abs, styles.schedule, { left: 20, top: 150, width: 440 }, { opacity: seg(p, 0.35, 0.55) }]}>
        <View style={styles.scheduleHead}>
          <MaterialIcons name="event-available" size={18} color={k.colors.primary} />
          <Text style={styles.scheduleTitle}>신청 일정</Text>
        </View>
        {scheduleRows.map((row, ri) => (
          <Animated.View key={row.key} style={[styles.scheduleRow, { opacity: seg(p, 0.5 + ri * 0.1, 0.66 + ri * 0.1) }]}>
            <Text style={[styles.th, { width: 96 }]}>{row.label}</Text>
            {data.districts.map(district => (
              <Text key={district.id} style={[styles.scheduleDate, { color: DISTRICT_COLOR[district.id] }]} testID={`story-date-${district.id}-${row.key}`}>
                {district.label} {storyShortDate(district.schedule[row.key]) ?? '—'}
              </Text>
            ))}
          </Animated.View>
        ))}
        {data.districts.some(district => Object.values(district.schedule).some(value => !value)) ? (
          <Text style={styles.scheduleNote}>— 표시는 공고 데이터가 연결되면 채워져요</Text>
        ) : null}
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
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: k.type.label.fontFamily, fontSize: 13, lineHeight: 18, color: k.colors.onPrimary },
  headCard: { ...card, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderColor: k.colors.primary, borderWidth: 2 },
  headIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontFamily: k.type.section.fontFamily, fontSize: 17, lineHeight: 23, color: k.colors.text },
  district: { ...card, borderTopWidth: 4, padding: 14, gap: 6 },
  districtTotal: { fontFamily: k.type.section.fontFamily, fontSize: 22, lineHeight: 30, color: k.colors.text },
  unitRow: { flexDirection: 'row', gap: 8 },
  unit: { flex: 1, borderRadius: 10, backgroundColor: k.colors.surfaceLow, paddingVertical: 6, alignItems: 'center' },
  unitLabel: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  unitValue: { fontFamily: k.type.label.fontFamily, fontSize: 15, color: k.colors.text },
  condition: { ...card, flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 8 },
  conditionIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  conditionLabel: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text, flexShrink: 0 },
  profile: { ...card, borderRadius: 18, borderWidth: 2, borderColor: k.colors.primary, padding: 14, gap: 10 },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileTitle: { fontFamily: k.type.label.fontFamily, fontSize: 16, lineHeight: 22, color: k.colors.text },
  onceTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: k.colors.primaryFixed },
  onceText: { fontFamily: k.type.label.fontFamily, fontSize: 12, color: k.colors.primary },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: k.colors.primary, opacity: 0.85 },
  profileDock: { ...card, borderWidth: 2, borderColor: k.colors.primary, padding: 12, gap: 4, alignItems: 'flex-start' },
  checkColumn: { ...card, borderTopWidth: 4, height: 180, padding: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 6, borderRadius: 10, backgroundColor: k.colors.surfaceLow },
  checkText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text },
  tableHead: { flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: k.colors.surfaceLow },
  tableRow: { ...card, flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  th: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.textMuted },
  thCell: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  cellText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text },
  cellMuted: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: k.type.label.fontFamily, fontSize: 12 },
  exampleNote: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted, textAlign: 'center' },
  choiceRow: { flexDirection: 'row', gap: 12 },
  choice: { ...card, flex: 1, borderTopWidth: 4, padding: 12, gap: 6 },
  choiceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceTitle: { fontFamily: k.type.section.fontFamily, fontSize: 17, lineHeight: 24, color: k.colors.text },
  exampleTag: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  schedule: { ...card, padding: 12, gap: 6 },
  scheduleHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  scheduleTitle: { fontFamily: k.type.label.fontFamily, fontSize: 15, color: k.colors.text },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', height: 30, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  scheduleDate: { flex: 1, minWidth: 0, fontFamily: k.type.label.fontFamily, fontSize: 14 },
  scheduleNote: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted, paddingTop: 4 },
});
