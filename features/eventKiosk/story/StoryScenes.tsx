import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { MediaPlaceholder } from '../media/ListingMediaView';
import { bucketTone, k } from '../ui/theme';
import { STORY_CONDITION_TAGS, STORY_PROFILE_FIELDS, type StoryData } from './storyData';

/**
 * 장면 그림. 모두 480×380 짜리 논리 무대 위에 절대 위치로 그리고, 바깥(StoryStage)이 화면 크기에 맞게 확대·축소한다.
 * 그래서 iPad·데스크톱·휴대폰에서 같은 구도가 유지된다.
 *
 * 각 장면은 0→1 로 가는 progress 하나만 받는다. reduced motion 이면 처음부터 1 이라 완성된 그림만 보인다.
 * 움직임은 opacity·이동·작은 크기 변화뿐이다. 튀거나 흔들리지 않는다.
 */
export const STAGE = { width: 480, height: 380 } as const;

type P = Animated.Value;
type SceneProps = { p: P; data: StoryData };
/** 진행값 또는 그 구간값. 둘 다 다시 구간을 나눌 수 있다. */
type Src = Animated.Value | Animated.AnimatedInterpolation<string | number>;

/** progress 의 [from, to] 구간에서 0→1. 구간 밖은 고정. */
const seg = (p: Src, from: number, to: number) => p.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' });
const mix = (p: Src, from: number, to: number, a: number, b: number) =>
  p.interpolate({ inputRange: [from, to], outputRange: [a, b], extrapolate: 'clamp' });

/** 장면 1·2 에서 흩어져 있는 공고 카드 자리. 살짝 기울어 겹친다(정신없지 않게 각도는 작게). */
const SCATTER = [
  { x: 14, y: 24, r: '-3deg' },
  { x: 250, y: 6, r: '2.5deg' },
  { x: 132, y: 118, r: '-1.5deg' },
  { x: 6, y: 228, r: '2deg' },
  { x: 262, y: 206, r: '-2.5deg' },
];

function ListingMini({ title, meta, tags, tagOpacity }: { title: string; meta: string; tags: readonly string[]; tagOpacity?: Animated.AnimatedInterpolation<string | number> }) {
  return (
    <View style={styles.mini}>
      <View style={styles.miniHead}>
        <View style={styles.miniIcon}><MaterialIcons name="apartment" size={18} color={k.colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.miniTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.miniMeta} numberOfLines={1}>{meta}</Text>
        </View>
      </View>
      <Animated.View style={[styles.tags, tagOpacity ? { opacity: tagOpacity } : null]}>
        {tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}
      </Animated.View>
    </View>
  );
}

/** Scene 1 — 공고와 조건이 겹쳐 보이는 복잡함. */
export function SceneComplexity({ p, data }: SceneProps) {
  return (
    <View style={styles.stage}>
      {data.listings.map((listing, index) => {
        const spot = SCATTER[index % SCATTER.length];
        const appear = seg(p, index * 0.1, index * 0.1 + 0.35);
        return (
          <Animated.View
            key={listing.id}
            style={[styles.abs, { left: spot.x, top: spot.y, width: 212, opacity: appear, transform: [{ translateY: mix(appear, 0, 1, 14, 0) }, { rotate: spot.r }] }]}
          >
            <ListingMini title={listing.title} meta={listing.meta} tags={STORY_CONDITION_TAGS[index % STORY_CONDITION_TAGS.length]} tagOpacity={seg(p, 0.45 + index * 0.06, 0.75 + index * 0.05)} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Scene 2 — 공고는 뒤로, 내 조건은 한 장의 프로필로. */
export function SceneProfile({ p, data }: SceneProps) {
  const recede = seg(p, 0, 0.35);
  const card = seg(p, 0.2, 0.45);
  return (
    <View style={styles.stage}>
      {data.listings.map((listing, index) => {
        const spot = SCATTER[index % SCATTER.length];
        return (
          <Animated.View
            key={listing.id}
            style={[styles.abs, { left: spot.x, top: spot.y, width: 212, opacity: mix(recede, 0, 1, 1, 0.18), transform: [{ scale: mix(recede, 0, 1, 1, 0.9) }, { rotate: spot.r }] }]}
          >
            <ListingMini title={listing.title} meta={listing.meta} tags={STORY_CONDITION_TAGS[index % STORY_CONDITION_TAGS.length]} />
          </Animated.View>
        );
      })}
      <Animated.View style={[styles.abs, styles.profile, { left: 130, top: 56, width: 220, opacity: card, transform: [{ scale: mix(card, 0, 1, 0.96, 1) }] }]}>
        <View style={styles.profileHead}>
          <View style={styles.avatar}><MaterialIcons name="person" size={26} color={k.colors.onPrimary} /></View>
          <View>
            <Text style={styles.profileTitle}>내 청약 프로필</Text>
            <Text style={styles.profileMeta}>한 번 입력</Text>
          </View>
        </View>
        {STORY_PROFILE_FIELDS.map((field, index) => {
          const arrive = seg(p, 0.42 + index * 0.08, 0.62 + index * 0.08);
          const from = SCATTER[index % SCATTER.length];
          // 칩이 흩어진 공고 쪽에서 프로필 안 자기 자리로 모인다.
          const dx = from.x - 130;
          const dy = from.y - 56 - 64 - index * 34;
          return (
            <Animated.View
              key={field.label}
              style={[styles.field, { opacity: arrive, transform: [{ translateX: mix(arrive, 0, 1, dx * 0.35, 0) }, { translateY: mix(arrive, 0, 1, dy * 0.35, 0) }] }]}
            >
              <MaterialIcons name={field.icon} size={18} color={k.colors.primary} />
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <MaterialIcons name="check" size={18} color={k.tint.green.fg} />
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const PROFILE_DOCK = { x: 10, y: 128, width: 150, height: 112 };

/** 두 점을 잇는 선의 가운데·길이·각도. */
function connector(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return { midX: (x1 + x2) / 2, midY: (y1 + y2) / 2, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}
const COLUMN = { x: 296, width: 176, height: 58, gap: 14, top: 8 };
const ANALYSIS_PHASES = (region: string) => [`${region} 공고 확인`, '공급유형 비교', '자격 조건 분석'];

/** Scene 3 — 한 프로필에서 여러 공고로 동시에. 연결선이 펼쳐지고 세 단계가 차례로 켜진다. */
export function SceneAnalysis({ p, data }: SceneProps) {
  const dock = seg(p, 0, 0.18);
  const startX = PROFILE_DOCK.x + PROFILE_DOCK.width;
  const startY = PROFILE_DOCK.y + PROFILE_DOCK.height / 2;
  const phases = ANALYSIS_PHASES(data.region);
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.abs, styles.profileDock, { left: PROFILE_DOCK.x, top: PROFILE_DOCK.y, width: PROFILE_DOCK.width, height: PROFILE_DOCK.height, opacity: dock }]}>
        <View style={styles.avatarSmall}><MaterialIcons name="person" size={20} color={k.colors.onPrimary} /></View>
        <Text style={styles.profileTitle}>내 프로필</Text>
        <Text style={styles.profileMeta}>조건 5가지</Text>
      </Animated.View>
      {data.listings.map((listing, index) => {
        const y = COLUMN.top + index * (COLUMN.height + COLUMN.gap);
        const line = seg(p, 0.12 + index * 0.06, 0.32 + index * 0.06);
        const compared = seg(p, 0.45 + index * 0.03, 0.55 + index * 0.03);
        const checked = seg(p, 0.75 + index * 0.03, 0.85 + index * 0.03);
        const link = connector(startX, startY, COLUMN.x, y + COLUMN.height / 2);
        return (
          <View key={listing.id} style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* 프로필에서 공고로 이어지는 선. 선의 가운데를 기준으로 회전하고, 프로필 쪽에서부터 길어진다. */}
            <Animated.View
              style={[
                styles.abs,
                styles.link,
                {
                  left: link.midX - link.length / 2,
                  top: link.midY - 1,
                  width: link.length,
                  opacity: mix(line, 0, 1, 0, 0.7),
                  transform: [
                    { rotate: `${link.angle}rad` },
                    { translateX: mix(line, 0, 1, -link.length / 2, 0) },
                    { scaleX: line },
                  ],
                },
              ]}
            />
            <Animated.View style={[styles.abs, styles.target, { left: COLUMN.x, top: y, width: COLUMN.width, height: COLUMN.height, opacity: mix(line, 0, 1, 0.35, 1) }]}>
              <Text style={styles.targetTitle} numberOfLines={1}>{listing.title}</Text>
              <View style={styles.targetRow}>
                <Animated.Text style={[styles.targetMeta, { opacity: compared }]}>공급 {listing.supplyCount}개 비교</Animated.Text>
                <Animated.View style={{ opacity: checked }}><MaterialIcons name="check-circle" size={18} color={k.colors.primary} /></Animated.View>
              </View>
            </Animated.View>
          </View>
        );
      })}
      <View style={[styles.abs, styles.phases, { left: 0, top: 300, width: 286 }]}>
        {phases.map((label, index) => {
          const on = seg(p, 0.2 + index * 0.27, 0.3 + index * 0.27);
          return (
            <Animated.View key={label} style={[styles.phase, { opacity: mix(on, 0, 1, 0.35, 1) }]}>
              <Animated.View style={[styles.phaseDot, { opacity: on }]} />
              <Text style={styles.phaseText}>{label}</Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const BUCKETS = [
  { key: 'eligible', label: '신청 가능', x: 6 },
  { key: 'review', label: '조건 확인', x: 166 },
  { key: 'difficult', label: '신청 어려움', x: 326 },
] as const;
/** 분류 장면의 예시 배치(열, 열 안 순서). 실제 판정이 아니라 '나뉜다'를 보여 주는 예시다. 첫 칩이 강조되는 공급. */
const SORTED: readonly [number, number][] = [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1], [1, 1]];
const FEATURED = 0;

/** Scene 4 — 공급유형이 세 묶음으로 나뉘고, 신청 가능한 하나가 이유와 함께 강조된다. */
export function SceneSorting({ p, data }: SceneProps) {
  const highlight = seg(p, 0.55, 0.7);
  const callouts = ['어디에 · 신청 가능한 공급', '왜 · 충족한 조건', '무엇을 · 더 확인할 서류'];
  return (
    <View style={styles.stage}>
      {BUCKETS.map((bucket, index) => (
        <Animated.View key={bucket.key} style={[styles.abs, styles.bucket, { left: bucket.x, top: 0, opacity: seg(p, 0, 0.15 + index * 0.05) }]}>
          <View style={[styles.bucketHead, { backgroundColor: bucketTone[bucket.key].bg }]}>
            <MaterialIcons name={bucketTone[bucket.key].icon} size={16} color={bucketTone[bucket.key].fg} />
            <Text style={[styles.bucketLabel, { color: bucketTone[bucket.key].fg }]}>{bucket.label}</Text>
          </View>
        </Animated.View>
      ))}
      {data.supplies.slice(0, SORTED.length).map((label, index) => {
        const [column, slot] = SORTED[index];
        const move = seg(p, 0.12 + index * 0.05, 0.42 + index * 0.05);
        const targetX = BUCKETS[column].x + 4;
        const targetY = 46 + slot * 50;
        const startX = 170;
        const startY = 120 + (index % 3) * 18;
        const isFeatured = index === FEATURED;
        return (
          <Animated.View
            key={label}
            style={[
              styles.abs,
              styles.chip,
              isFeatured && styles.chipFeatured,
              {
                left: 0,
                top: 0,
                opacity: mix(move, 0, 1, 0.6, column === 2 ? 0.6 : 1),
                transform: [
                  { translateX: mix(move, 0, 1, startX, targetX) },
                  { translateY: mix(move, 0, 1, startY, targetY) },
                  { scale: isFeatured ? mix(highlight, 0, 1, 1, 1.05) : 1 },
                ],
              },
            ]}
          >
            <View style={styles.chipRow}>
              <Text style={[styles.chipText, isFeatured && styles.chipTextFeatured]} numberOfLines={1}>{label}</Text>
              {isFeatured ? <Animated.View style={{ opacity: highlight }}><MaterialIcons name="check-circle" size={16} color={k.colors.primary} /></Animated.View> : null}
            </View>
          </Animated.View>
        );
      })}
      <Animated.View style={[styles.abs, styles.callouts, { left: 6, top: 196, width: 468, opacity: highlight }]}>
        {callouts.map((text, index) => {
          const show = seg(p, 0.62 + index * 0.1, 0.75 + index * 0.1);
          return (
            <Animated.View key={text} style={[styles.callout, { opacity: show, transform: [{ translateY: mix(show, 0, 1, 8, 0) }] }]}>
              <MaterialIcons name={index === 0 ? 'place' : index === 1 ? 'fact-check' : 'description'} size={20} color={k.colors.primary} />
              <Text style={styles.calloutText}>{text}</Text>
            </Animated.View>
          );
        })}
        <Text style={styles.example}>예시 화면 · 실제 결과는 입력한 조건으로 계산해요</Text>
      </Animated.View>
    </View>
  );
}

/** Scene 5 — 선택한 주택 카드가 커지며 실제 상세 화면의 요소로 이어진다. */
function FeaturedHousingMedia({ featured }: { featured: StoryData['featured'] }) {
  const [failed, setFailed] = useState(false);
  const image = failed ? null : featured.media.primary;
  useEffect(() => setFailed(false), [featured.media.primary?.uri]);
  if (!image) return <MediaPlaceholder housingType={featured.housingType} district={featured.district} />;
  return <Image source={{ uri: image.uri }} style={styles.storyImage} resizeMode="cover" accessibilityLabel={image.alt} onError={() => setFailed(true)} />;
}

export function SceneAction({ p, data }: SceneProps) {
  const grow = seg(p, 0, 0.5);
  const details = seg(p, 0.45, 0.9);
  return (
    <View style={styles.stage}>
      <Animated.View
        style={[
          styles.abs,
          styles.detail,
          {
            left: 40,
            top: 0,
            width: 400,
            opacity: mix(grow, 0, 0.4, 0, 1),
            transform: [{ translateY: mix(grow, 0, 1, 24, 0) }, { scale: mix(grow, 0, 1, 0.82, 1) }],
          },
        ]}
      >
        <View style={styles.detailMedia}>
          <FeaturedHousingMedia featured={data.featured} />
        </View>
        <View style={styles.detailBody}>
          <View style={styles.detailBadges}>
            <View style={[styles.statusBadge, { backgroundColor: bucketTone.eligible.bg }]}>
              <MaterialIcons name="check-circle" size={16} color={bucketTone.eligible.fg} />
              <Text style={[styles.statusText, { color: bucketTone.eligible.fg }]}>신청 가능</Text>
            </View>
            <Text style={styles.exampleTag}>예시</Text>
          </View>
          <Text style={styles.detailTitle} numberOfLines={1}>{data.featured.title}</Text>
          <Text style={styles.detailMeta} numberOfLines={1}>{data.featured.supplyLabel} · {data.featured.meta}</Text>
          <Animated.View style={[styles.detailRows, { opacity: details }]}>
            <View style={styles.detailRow}>
              <MaterialIcons name="event" size={18} color={k.colors.textMuted} />
              <Text style={styles.detailRowText}>{data.featured.schedule}</Text>
            </View>
            <View style={styles.scoreRow}>
              {/* 공식 배점과 완판e 추천은 다른 상자. 같은 숫자처럼 보이지 않게 이름을 붙여 나눈다. */}
              <View style={styles.scoreBox}><Text style={styles.scoreLabel}>공식 배점</Text><Text style={styles.scoreValue}>공고 기준</Text></View>
              <View style={[styles.scoreBox, styles.scoreBoxWanpan]}><Text style={[styles.scoreLabel, { color: k.colors.primary }]}>완판e 추천</Text><Text style={[styles.scoreValue, { color: k.colors.primary }]}>비교 참고</Text></View>
            </View>
            <View style={styles.askChip}>
              <MaterialIcons name="forum" size={18} color={k.colors.primary} />
              <Text style={styles.askText}>AI에게 물어보기</Text>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: STAGE.width, height: STAGE.height },
  abs: { position: 'absolute' },
  mini: { backgroundColor: k.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: k.colors.outline, padding: 12, gap: 8, boxShadow: '0 6px 16px rgba(59,48,158,0.08)' } as object,
  miniHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: k.colors.lavender, alignItems: 'center', justifyContent: 'center' },
  miniTitle: { fontFamily: k.type.label.fontFamily, fontSize: 14, lineHeight: 19, color: k.colors.text },
  miniMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 11, lineHeight: 15, color: k.colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { fontFamily: k.type.caption.fontFamily, fontSize: 11, lineHeight: 15, color: k.tint.amber.fg, backgroundColor: k.tint.amber.bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  profile: { backgroundColor: k.colors.surface, borderRadius: 18, borderWidth: 2, borderColor: k.colors.primary, padding: 14, gap: 6, boxShadow: '0 12px 28px rgba(59,48,158,0.16)' } as object,
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileTitle: { fontFamily: k.type.label.fontFamily, fontSize: 15, lineHeight: 20, color: k.colors.text },
  profileMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 28, paddingHorizontal: 10, borderRadius: 10, backgroundColor: k.colors.surfaceLow },
  fieldLabel: { flex: 1, fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.text },
  profileDock: { backgroundColor: k.colors.surface, borderRadius: 16, borderWidth: 2, borderColor: k.colors.primary, padding: 12, gap: 4, alignItems: 'flex-start', justifyContent: 'center' },
  target: { backgroundColor: k.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, paddingHorizontal: 12, justifyContent: 'center', gap: 4 },
  targetTitle: { fontFamily: k.type.label.fontFamily, fontSize: 13, lineHeight: 18, color: k.colors.text },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  targetMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 11, color: k.colors.textMuted },
  phases: { gap: 8 },
  phase: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: k.colors.primary },
  phaseText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text },
  bucket: { width: 148 },
  bucketHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 10 },
  bucketLabel: { fontFamily: k.type.label.fontFamily, fontSize: 13 },
  chip: { width: 140, height: 40, borderRadius: 10, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.outline, paddingHorizontal: 10, justifyContent: 'center' },
  chipFeatured: { borderColor: k.colors.primary, borderWidth: 2, backgroundColor: k.colors.lavender },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipTextFeatured: { color: k.colors.primary, flex: 1 },
  link: { height: 2, borderRadius: 1, backgroundColor: k.colors.primary },
  chipText: { fontFamily: k.type.label.fontFamily, fontSize: 12, color: k.colors.text },
  callouts: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: k.colors.lavender },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calloutText: { fontFamily: k.type.label.fontFamily, fontSize: 15, lineHeight: 21, color: k.colors.text },
  example: { fontFamily: k.type.caption.fontFamily, fontSize: 11, color: k.colors.textMuted, marginTop: 2 },
  detail: { backgroundColor: k.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: k.colors.outline, overflow: 'hidden', boxShadow: '0 16px 36px rgba(59,48,158,0.14)' } as object,
  detailMedia: { height: 132 },
  storyImage: { width: '100%', height: '100%' },
  detailBody: { padding: 16, gap: 6 },
  detailBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 999 },
  statusText: { fontFamily: k.type.label.fontFamily, fontSize: 13 },
  exampleTag: { fontFamily: k.type.caption.fontFamily, fontSize: 11, color: k.colors.textMuted },
  detailTitle: { fontFamily: k.type.section.fontFamily, fontSize: 18, lineHeight: 24, color: k.colors.text },
  detailMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  detailRows: { gap: 8, marginTop: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailRowText: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.text },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreBox: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: k.colors.outline, paddingHorizontal: 10, paddingVertical: 6 },
  scoreBoxWanpan: { borderColor: k.colors.lavender, backgroundColor: k.colors.lavender },
  scoreLabel: { fontFamily: k.type.caption.fontFamily, fontSize: 11, color: k.colors.textMuted },
  scoreValue: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.text },
  askChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: k.colors.primaryFixed },
  askText: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.primary },
});
