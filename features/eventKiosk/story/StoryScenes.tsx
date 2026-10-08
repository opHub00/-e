import { MaterialIcons } from '@expo/vector-icons';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { MediaPlaceholder } from '../media/ListingMediaView';
import { bucketTone, k } from '../ui/theme';
import { STORY_CONDITION_TAGS, STORY_PROFILE_FIELDS, type StoryData } from './storyData';

/**
 * 장면 그림.
 *
 * 무대는 두 가지다. 넓은 화면(iPad·데스크톱)은 480×380, 좁은 화면(휴대폰)은 340×460.
 * 휴대폰에서는 넓은 구도를 줄이지 않고, 요소 수를 줄이고 세로로 다시 놓아 글자가 실제 크기에 가깝게 보이게 한다.
 * 바깥(ProductStory)이 무대를 화면 크기에 맞춰 확대·축소한다.
 *
 * 각 장면은 0→1 로 가는 progress 하나만 받는다. reduced motion 이면 처음부터 1 이라 완성된 그림만 보인다.
 * 움직임은 opacity·이동·작은 크기 변화뿐. 숫자 점수나 게이지는 쓰지 않는다.
 */
export type StoryLayout = 'wide' | 'compact';
export const STAGES: Record<StoryLayout, { width: number; height: number }> = {
  wide: { width: 480, height: 380 },
  compact: { width: 340, height: 460 },
};

type P = Animated.Value;
type Src = Animated.Value | Animated.AnimatedInterpolation<string | number>;
export type SceneProps = { p: P; data: StoryData; layout: StoryLayout };

const seg = (p: Src, from: number, to: number) => p.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' });
const mix = (p: Src, from: number, to: number, a: number, b: number) =>
  p.interpolate({ inputRange: [from, to], outputRange: [a, b], extrapolate: 'clamp' });

/** 장면 1·2 의 흩어진 공고 카드 자리. 휴대폰은 세 장만, 더 크게. */
const SCATTER: Record<StoryLayout, { x: number; y: number; r: string; w: number }[]> = {
  wide: [
    { x: 14, y: 24, r: '-3deg', w: 212 },
    { x: 250, y: 6, r: '2.5deg', w: 212 },
    { x: 132, y: 118, r: '-1.5deg', w: 212 },
    { x: 6, y: 228, r: '2deg', w: 212 },
    { x: 262, y: 206, r: '-2.5deg', w: 212 },
  ],
  compact: [
    { x: 8, y: 24, r: '-2.5deg', w: 280 },
    { x: 52, y: 162, r: '2deg', w: 280 },
    { x: 16, y: 300, r: '-1.5deg', w: 280 },
  ],
};

function ListingMini({ title, meta, tags, tagOpacity, large }: {
  title: string;
  meta: string;
  tags: readonly string[];
  tagOpacity?: Src;
  large?: boolean;
}) {
  return (
    <View style={[styles.mini, large && styles.miniLarge]}>
      <View style={styles.miniHead}>
        <View style={styles.miniIcon}><MaterialIcons name="apartment" size={large ? 20 : 18} color={k.colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniTitle, large && styles.miniTitleLarge]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.miniMeta, large && styles.miniMetaLarge]} numberOfLines={1}>{meta}</Text>
        </View>
      </View>
      <Animated.View style={[styles.tags, tagOpacity ? { opacity: tagOpacity } : null]}>
        {tags.map(tag => <Text key={tag} style={[styles.tag, large && styles.tagLarge]}>{tag}</Text>)}
      </Animated.View>
    </View>
  );
}

/** Scene 1 — 공고와 조건이 겹쳐 보이는 복잡함. 빠르게 지나간다. */
export function SceneComplexity({ p, data, layout }: SceneProps) {
  const spots = SCATTER[layout];
  return (
    <View style={STAGES[layout]}>
      {data.listings.slice(0, spots.length).map((listing, index) => {
        const spot = spots[index];
        const appear = seg(p, index * 0.08, index * 0.08 + 0.3);
        return (
          <Animated.View
            key={listing.id}
            style={[styles.abs, { left: spot.x, top: spot.y, width: spot.w, opacity: appear, transform: [{ translateY: mix(appear, 0, 1, 12, 0) }, { rotate: spot.r }] }]}
          >
            <ListingMini
              title={listing.title}
              meta={listing.meta}
              tags={STORY_CONDITION_TAGS[index % STORY_CONDITION_TAGS.length]}
              tagOpacity={seg(p, 0.4 + index * 0.06, 0.7 + index * 0.05)}
              large={layout === 'compact'}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const PROFILE_CARD: Record<StoryLayout, { x: number; y: number; w: number }> = {
  wide: { x: 130, y: 56, w: 220 },
  compact: { x: 40, y: 70, w: 260 },
};

/** Scene 2 — 공고는 뒤로, 내 조건은 한 장의 프로필로. */
export function SceneProfile({ p, data, layout }: SceneProps) {
  const spots = SCATTER[layout];
  const card = PROFILE_CARD[layout];
  const recede = seg(p, 0, 0.3);
  const appear = seg(p, 0.15, 0.4);
  const compact = layout === 'compact';
  return (
    <View style={STAGES[layout]}>
      {data.listings.slice(0, spots.length).map((listing, index) => {
        const spot = spots[index];
        return (
          <Animated.View
            key={listing.id}
            style={[styles.abs, { left: spot.x, top: spot.y, width: spot.w, opacity: mix(recede, 0, 1, 1, compact ? 0.08 : 0.16), transform: [{ scale: mix(recede, 0, 1, 1, 0.9) }, { rotate: spot.r }] }]}
          >
            <ListingMini title={listing.title} meta={listing.meta} tags={STORY_CONDITION_TAGS[index % STORY_CONDITION_TAGS.length]} large={compact} />
          </Animated.View>
        );
      })}
      <Animated.View style={[styles.abs, styles.profile, { left: card.x, top: card.y, width: card.w, opacity: appear, transform: [{ scale: mix(appear, 0, 1, 0.96, 1) }] }]}>
        <View style={styles.profileHead}>
          <View style={styles.avatar}><MaterialIcons name="person" size={26} color={k.colors.onPrimary} /></View>
          <View>
            <Text style={[styles.profileTitle, compact && styles.profileTitleLarge]}>내 청약 프로필</Text>
            <Text style={styles.profileMeta}>한 번 입력</Text>
          </View>
        </View>
        {STORY_PROFILE_FIELDS.map((field, index) => {
          const arrive = seg(p, 0.35 + index * 0.08, 0.55 + index * 0.08);
          return (
            <Animated.View
              key={field.label}
              style={[styles.field, compact && styles.fieldLarge, { opacity: arrive, transform: [{ translateX: mix(arrive, 0, 1, index % 2 ? 24 : -24, 0) }] }]}
            >
              <MaterialIcons name={field.icon} size={compact ? 20 : 18} color={k.colors.primary} />
              <Text style={[styles.fieldLabel, compact && styles.fieldLabelLarge]}>{field.label}</Text>
              <MaterialIcons name="check" size={18} color={k.tint.green.fg} />
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}

/**
 * Scene 3 — 완판e 의 핵심. 같은 프로필의 다섯 항목이 모든 공고에서 '같은 순서로 동시에' 검사되고,
 * 그다음 공고마다 결과가 차례로 정해진다. 로딩이 아니라 '한 정보로 여러 공고를 비교한다'가 보이게.
 *
 * 순서(progress)
 *  0.00–0.15 프로필 완성(다섯 항목 아이콘)
 *  0.12–0.30 모든 공고로 연결선이 동시에 뻗음
 *  0.30–0.70 공고마다 같은 다섯 항목이 한 칸씩 함께 켜짐(조건 검사)
 *  0.70–0.95 위에서부터 결과가 하나씩 정해짐(예시)
 */
const ANALYSIS_STATUS: ('eligible' | 'review' | 'difficult')[] = ['eligible', 'review', 'difficult', 'eligible', 'review'];
const STATUS_TEXT = { eligible: '신청 가능', review: '조건 확인', difficult: '신청 어려움' } as const;

type Box = { x: number; y: number; w: number; h: number };
const ANALYSIS_LAYOUT: Record<StoryLayout, { profile: Box; rows: Box[]; phases: Box }> = {
  wide: {
    profile: { x: 6, y: 96, w: 186, h: 136 },
    rows: [0, 1, 2, 3, 4].map(i => ({ x: 236, y: 4 + i * 72, w: 240, h: 62 })),
    phases: { x: 6, y: 262, w: 200, h: 80 },
  },
  compact: {
    profile: { x: 60, y: 0, w: 220, h: 96 },
    rows: [0, 1, 2].map(i => ({ x: 48, y: 140 + i * 84, w: 288, h: 70 })),
    phases: { x: 8, y: 400, w: 330, h: 56 },
  },
};

function connector(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return { midX: (x1 + x2) / 2, midY: (y1 + y2) / 2, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

/** 한쪽 끝에서부터 길어지는 선. */
function GrowingLine({ from, to, progress }: { from: [number, number]; to: [number, number]; progress: Src }) {
  const link = connector(from[0], from[1], to[0], to[1]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        styles.link,
        {
          left: link.midX - link.length / 2,
          top: link.midY - 1,
          width: link.length,
          opacity: mix(progress, 0, 1, 0, 0.75),
          transform: [{ rotate: `${link.angle}rad` }, { translateX: mix(progress, 0, 1, -link.length / 2, 0) }, { scaleX: progress }],
        },
      ]}
    />
  );
}

export function SceneAnalysis({ p, data, layout }: SceneProps) {
  const spec = ANALYSIS_LAYOUT[layout];
  const compact = layout === 'compact';
  const profileIn = seg(p, 0, 0.15);
  const linesIn = seg(p, 0.12, 0.3);
  const rows = spec.rows;
  const listings = data.listings.slice(0, rows.length);
  const phases = [`${data.region} 공고 연결`, '같은 조건으로 함께 검사', '공고마다 결과 결정'];
  const phaseWindows: [number, number][] = [[0.12, 0.3], [0.3, 0.7], [0.7, 0.95]];

  // 휴대폰: 프로필 왼쪽에서 세로 줄기가 내려가고, 공고마다 가지가 뻗는다(선이 카드를 가로지르지 않게).
  const trunkX = 22;
  const profileMidY = spec.profile.y + spec.profile.h / 2;
  const last = rows[rows.length - 1];
  const links: { from: [number, number]; to: [number, number] }[] = compact
    ? [
        { from: [spec.profile.x, profileMidY], to: [trunkX, profileMidY] },
        { from: [trunkX, profileMidY], to: [trunkX, last.y + last.h / 2] },
        ...rows.map(row => ({ from: [trunkX, row.y + row.h / 2] as [number, number], to: [row.x, row.y + row.h / 2] as [number, number] })),
      ]
    : rows.map(row => ({ from: [spec.profile.x + spec.profile.w, profileMidY] as [number, number], to: [row.x, row.y + row.h / 2] as [number, number] }));

  return (
    <View style={STAGES[layout]}>
      {links.map((link, index) => <GrowingLine key={index} from={link.from} to={link.to} progress={linesIn} />)}

      <Animated.View style={[styles.abs, styles.profileDock, { left: spec.profile.x, top: spec.profile.y, width: spec.profile.w, height: spec.profile.h, opacity: profileIn }]}>
        <View style={styles.dockHead}>
          <View style={styles.avatarSmall}><MaterialIcons name="person" size={18} color={k.colors.onPrimary} /></View>
          <Text style={[styles.profileTitle, compact && styles.profileTitleLarge]}>내 프로필</Text>
        </View>
        <View style={styles.dockFields}>
          {STORY_PROFILE_FIELDS.map(field => (
            <View key={field.label} style={styles.dockField}>
              <MaterialIcons name={field.icon} size={compact ? 18 : 16} color={k.colors.primary} />
            </View>
          ))}
        </View>
        {compact ? null : <Text style={styles.profileMeta}>이 다섯 가지로 모든 공고를 봐요</Text>}
      </Animated.View>

      {listings.map((listing, row) => {
        const box = rows[row];
        const status = ANALYSIS_STATUS[row % ANALYSIS_STATUS.length];
        const tone = bucketTone[status];
        const decided = seg(p, 0.7 + row * 0.05, 0.8 + row * 0.05);
        return (
          <Animated.View
            key={listing.id}
            style={[styles.abs, styles.target, { left: box.x, top: box.y, width: box.w, height: box.h, opacity: mix(linesIn, 0, 1, 0.3, 1) }]}
          >
            <View style={styles.targetTop}>
              <Text style={[styles.targetTitle, compact && styles.targetTitleLarge]} numberOfLines={1}>{listing.title}</Text>
              <Animated.View style={[styles.statusPill, { backgroundColor: tone.bg, opacity: decided, transform: [{ scale: mix(decided, 0, 1, 0.9, 1) }] }]}>
                <MaterialIcons name={tone.icon} size={14} color={tone.fg} />
                <Text style={[styles.statusPillText, { color: tone.fg }]}>{STATUS_TEXT[status]}</Text>
              </Animated.View>
            </View>
            {/* 프로필과 같은 다섯 항목. 모든 공고에서 같은 칸이 동시에 켜진다 = 같은 정보로 비교한다. */}
            <View style={styles.checks}>
              {STORY_PROFILE_FIELDS.map((field, column) => {
                const on = seg(p, 0.3 + column * 0.08, 0.38 + column * 0.08);
                return (
                  <View key={field.label} style={styles.check}>
                    <MaterialIcons name={field.icon} size={compact ? 16 : 14} color={k.colors.outline} />
                    <Animated.View style={[StyleSheet.absoluteFill, styles.checkOn, { opacity: on }]}>
                      <MaterialIcons name={field.icon} size={compact ? 16 : 14} color={k.colors.primary} />
                    </Animated.View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        );
      })}

      <View style={[styles.abs, compact ? styles.phasesRow : styles.phases, { left: spec.phases.x, top: spec.phases.y, width: spec.phases.w }]}>
        {phases.map((label, index) => {
          const [from, to] = phaseWindows[index];
          const on = seg(p, from, to);
          return (
            <Animated.View key={label} style={[styles.phase, { opacity: mix(on, 0, 1, 0.3, 1) }]}>
              <Text style={[styles.phaseStep, compact && styles.phaseStepCompact]}>{index + 1}</Text>
              {compact ? null : <Text style={styles.phaseText}>{label}</Text>}
            </Animated.View>
          );
        })}
        {compact ? <Text style={styles.phaseCaption}>공고 연결 → 같은 조건 검사 → 결과 결정</Text> : null}
        <Text style={styles.example}>상태는 예시예요</Text>
      </View>
    </View>
  );
}

/**
 * Scene 4 — 세 묶음이 색·아이콘·자리로 바로 구별된다. 숫자·게이지 없이 이름과 색만.
 * 넓은 화면은 세 열, 휴대폰은 세 줄.
 */
const BUCKET_ORDER = ['eligible', 'review', 'difficult'] as const;
const BUCKET_TEXT = { eligible: '신청 가능', review: '조건 확인', difficult: '신청 어려움' } as const;
/** 각 공급 칩의 묶음과 묶음 안 순서. 예시 배치다. 0번 칩이 강조된다. */
const SORTED: readonly [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];

const SORT_LAYOUT: Record<StoryLayout, { panel: (b: number) => Box; chip: (b: number, slot: number) => Box; callouts: Box }> = {
  wide: {
    panel: b => ({ x: 4 + b * 160, y: 0, w: 152, h: 214 }),
    chip: (b, slot) => ({ x: 4 + b * 160 + 8, y: 52 + slot * 54, w: 136, h: 44 }),
    callouts: { x: 4, y: 226, w: 472, h: 140 },
  },
  compact: {
    panel: b => ({ x: 0, y: b * 96, w: 340, h: 86 }),
    chip: (b, slot) => ({ x: 10 + slot * 162, y: b * 96 + 38, w: 154, h: 40 }),
    callouts: { x: 0, y: 296, w: 340, h: 160 },
  },
};

export function SceneSorting({ p, data, layout }: SceneProps) {
  const spec = SORT_LAYOUT[layout];
  const compact = layout === 'compact';
  const highlight = seg(p, 0.55, 0.7);
  const callouts = ['어디에 · 신청 가능한 공급', '왜 · 충족한 조건', '무엇을 · 더 확인할 서류'];
  const center = compact ? { x: 93, y: 120 } : { x: 172, y: 110 };
  return (
    <View style={STAGES[layout]}>
      {BUCKET_ORDER.map((bucket, index) => {
        const box = spec.panel(index);
        const tone = bucketTone[bucket];
        return (
          <Animated.View
            key={bucket}
            style={[styles.abs, styles.panel, { left: box.x, top: box.y, width: box.w, height: box.h, backgroundColor: tone.bg, borderColor: tone.fg, opacity: seg(p, index * 0.05, 0.15 + index * 0.05) }]}
          >
            <View style={styles.panelHead}>
              <MaterialIcons name={tone.icon} size={compact ? 22 : 20} color={tone.fg} />
              <Text style={[styles.panelLabel, compact && styles.panelLabelLarge, { color: tone.fg }]}>{BUCKET_TEXT[bucket]}</Text>
            </View>
          </Animated.View>
        );
      })}
      {data.supplies.slice(0, SORTED.length).map((label, index) => {
        const [bucket, slot] = SORTED[index];
        const box = spec.chip(bucket, slot);
        const move = seg(p, 0.12 + index * 0.04, 0.42 + index * 0.04);
        const featured = index === 0;
        const difficult = bucket === 2;
        return (
          <Animated.View
            key={label}
            style={[
              styles.abs,
              styles.chip,
              featured && styles.chipFeatured,
              difficult && styles.chipMuted,
              {
                left: 0,
                top: 0,
                width: box.w,
                height: box.h,
                opacity: mix(move, 0, 0.4, 0, 1),
                transform: [
                  { translateX: mix(move, 0, 1, center.x, box.x) },
                  { translateY: mix(move, 0, 1, center.y, box.y) },
                  { scale: featured ? mix(highlight, 0, 1, 1, 1.04) : 1 },
                ],
              },
            ]}
          >
            <View style={styles.chipRow}>
              <Text style={[styles.chipText, compact && styles.chipTextLarge, featured && styles.chipTextFeatured, difficult && styles.chipTextMuted]} numberOfLines={1}>{label}</Text>
              {featured ? <Animated.View style={{ opacity: highlight }}><MaterialIcons name="check-circle" size={18} color={k.colors.primary} /></Animated.View> : null}
            </View>
          </Animated.View>
        );
      })}
      <Animated.View style={[styles.abs, styles.callouts, { left: spec.callouts.x, top: spec.callouts.y, width: spec.callouts.w, opacity: highlight }]}>
        {callouts.map((text, index) => {
          const show = seg(p, 0.62 + index * 0.1, 0.75 + index * 0.1);
          return (
            <Animated.View key={text} style={[styles.callout, { opacity: show, transform: [{ translateY: mix(show, 0, 1, 8, 0) }] }]}>
              <MaterialIcons name={index === 0 ? 'place' : index === 1 ? 'fact-check' : 'description'} size={compact ? 22 : 20} color={k.colors.primary} />
              <Text style={[styles.calloutText, compact && styles.calloutTextLarge]}>{text}</Text>
            </Animated.View>
          );
        })}
        <Text style={styles.example}>예시 화면 · 실제 결과는 입력한 조건으로 계산해요</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Scene 5 — 선택한 주택이 커지며 실제 상세의 순서로 읽힌다: 대표 이미지 → 신청 상태 → 접수 일정 → AI 상담.
 * 사진은 크게 두되, 신청 상태 배지가 사진 아래 경계에 겹쳐 가장 진하게 보이도록 한다(사진이 판정보다 앞서지 않게).
 */
export function SceneAction({ p, data, layout }: SceneProps) {
  const compact = layout === 'compact';
  const width = compact ? 320 : 380;
  const left = compact ? 10 : 50;
  const photoHeight = compact ? 170 : 150;
  const photo = seg(p, 0, 0.3);
  const status = seg(p, 0.28, 0.48);
  const schedule = seg(p, 0.48, 0.66);
  const ask = seg(p, 0.66, 0.86);
  const media = data.featured.media[0];
  return (
    <View style={STAGES[layout]}>
      <Animated.View style={[styles.abs, styles.detail, { left, top: compact ? 10 : 0, width, opacity: photo, transform: [{ translateY: mix(photo, 0, 1, 16, 0) }] }]}>
        <View style={[styles.detailMedia, { height: photoHeight }]}>
          {media ? (
            <Image source={{ uri: media.uri }} style={styles.fill} resizeMode="cover" accessibilityLabel={media.alt} />
          ) : (
            <>
              {/* 이미지가 없을 때: 아래쪽은 상태 배지 자리라 글을 두지 않고, 위에 작은 표시만 단다. */}
              <MediaPlaceholder housingType={data.featured.housingType} district={data.featured.district} compact />
              <Text style={styles.mediaLabel}>{data.featured.housingType} · 대표 이미지</Text>
            </>
          )}
          {media?.credit ? <Text style={styles.credit} numberOfLines={1}>출처 · {media.credit}</Text> : null}
        </View>
        {/* 상태 배지는 사진 아래 경계에 걸쳐 놓는다. 사진보다 먼저 눈에 걸리는 가장 진한 요소. */}
        <Animated.View style={[styles.statusFloat, { top: photoHeight - 22, opacity: status, transform: [{ scale: mix(status, 0, 1, 0.92, 1) }] }]}>
          <MaterialIcons name="check-circle" size={22} color={k.colors.onPrimary} />
          <Text style={styles.statusFloatText}>신청 가능</Text>
          <Text style={styles.statusFloatExample}>예시</Text>
        </Animated.View>
        <View style={styles.detailBody}>
          <Text style={[styles.detailTitle, compact && styles.detailTitleLarge]} numberOfLines={1}>{data.featured.title}</Text>
          <Text style={styles.detailMeta} numberOfLines={1}>{data.featured.supplyLabel} · {data.featured.meta}</Text>
          <Animated.View style={[styles.detailRow, { opacity: schedule, transform: [{ translateY: mix(schedule, 0, 1, 6, 0) }] }]}>
            <MaterialIcons name="event" size={20} color={k.colors.primary} />
            <Text style={[styles.detailRowText, compact && styles.detailRowTextLarge]}>{data.featured.schedule}</Text>
          </Animated.View>
          <Animated.View style={[styles.askChip, { opacity: ask, transform: [{ translateY: mix(ask, 0, 1, 6, 0) }] }]}>
            <MaterialIcons name="forum" size={20} color={k.colors.primary} />
            <Text style={[styles.askText, compact && styles.askTextLarge]}>이 공고, AI에게 물어보기</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  fill: { width: '100%', height: '100%' },
  mini: { backgroundColor: k.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: k.colors.outline, padding: 12, gap: 8, boxShadow: '0 6px 16px rgba(59,48,158,0.08)' } as object,
  miniLarge: { padding: 14, gap: 10 },
  miniHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: k.colors.lavender, alignItems: 'center', justifyContent: 'center' },
  miniTitle: { fontFamily: k.type.label.fontFamily, fontSize: 14, lineHeight: 19, color: k.colors.text },
  miniTitleLarge: { fontSize: 16, lineHeight: 22 },
  miniMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 11, lineHeight: 15, color: k.colors.textMuted },
  miniMetaLarge: { fontSize: 13, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { fontFamily: k.type.caption.fontFamily, fontSize: 11, lineHeight: 15, color: k.tint.amber.fg, backgroundColor: k.tint.amber.bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  tagLarge: { fontSize: 13, lineHeight: 18, paddingHorizontal: 9, paddingVertical: 3 },
  profile: { backgroundColor: k.colors.surface, borderRadius: 18, borderWidth: 2, borderColor: k.colors.primary, padding: 14, gap: 6, boxShadow: '0 12px 28px rgba(59,48,158,0.16)' } as object,
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileTitle: { fontFamily: k.type.label.fontFamily, fontSize: 15, lineHeight: 20, color: k.colors.text },
  profileTitleLarge: { fontSize: 17, lineHeight: 23 },
  profileMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 12, lineHeight: 16, color: k.colors.textMuted },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 28, paddingHorizontal: 10, borderRadius: 10, backgroundColor: k.colors.surfaceLow },
  fieldLarge: { height: 36 },
  fieldLabel: { flex: 1, fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.text },
  fieldLabelLarge: { fontSize: 16 },
  profileDock: { backgroundColor: k.colors.surface, borderRadius: 16, borderWidth: 2, borderColor: k.colors.primary, padding: 12, gap: 8, justifyContent: 'center', boxShadow: '0 10px 24px rgba(59,48,158,0.14)' } as object,
  dockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dockFields: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  dockField: { width: 26, height: 26, borderRadius: 8, backgroundColor: k.colors.lavender, alignItems: 'center', justifyContent: 'center' },
  link: { height: 2, borderRadius: 1, backgroundColor: k.colors.primary },
  target: { backgroundColor: k.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: k.colors.outline, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', gap: 6 },
  targetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  targetTitle: { flex: 1, fontFamily: k.type.label.fontFamily, fontSize: 13, lineHeight: 18, color: k.colors.text },
  targetTitleLarge: { fontSize: 15, lineHeight: 20 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 24, borderRadius: 999 },
  statusPillText: { fontFamily: k.type.label.fontFamily, fontSize: 12 },
  checks: { flexDirection: 'row', gap: 6 },
  check: { width: 22, height: 22, borderRadius: 6, backgroundColor: k.colors.surfaceLow, alignItems: 'center', justifyContent: 'center' },
  checkOn: { alignItems: 'center', justifyContent: 'center', backgroundColor: k.colors.lavender, borderRadius: 6 },
  phases: { gap: 8 },
  phasesRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  phase: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseStep: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontFamily: k.type.label.fontFamily, fontSize: 12, color: k.colors.onPrimary, backgroundColor: k.colors.primary, overflow: 'hidden' },
  phaseStepCompact: { width: 26, height: 26, borderRadius: 13, lineHeight: 26, fontSize: 13 },
  phaseText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.text },
  phaseCaption: { fontFamily: k.type.label.fontFamily, fontSize: 13, color: k.colors.text, flexBasis: '100%' },
  example: { fontFamily: k.type.caption.fontFamily, fontSize: 11, color: k.colors.textMuted },
  panel: { borderRadius: 16, borderWidth: 1.5, padding: 10 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  panelLabel: { fontFamily: k.type.section.fontFamily, fontSize: 15 },
  panelLabelLarge: { fontSize: 17 },
  chip: { borderRadius: 10, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.outline, paddingHorizontal: 10, justifyContent: 'center' },
  chipFeatured: { borderColor: k.colors.primary, borderWidth: 2 },
  chipMuted: { backgroundColor: 'rgba(255,255,255,0.6)' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { flex: 1, fontFamily: k.type.label.fontFamily, fontSize: 12, color: k.colors.text },
  chipTextLarge: { fontSize: 14 },
  chipTextFeatured: { color: k.colors.primary },
  chipTextMuted: { color: k.colors.textMuted },
  callouts: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: k.colors.lavender },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calloutText: { fontFamily: k.type.label.fontFamily, fontSize: 15, lineHeight: 21, color: k.colors.text },
  calloutTextLarge: { fontSize: 16, lineHeight: 22 },
  detail: { backgroundColor: k.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: k.colors.outline, overflow: 'visible', boxShadow: '0 16px 36px rgba(59,48,158,0.14)' } as object,
  detailMedia: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', backgroundColor: k.colors.surfaceLow },
  mediaLabel: { position: 'absolute', top: 12, left: 14, fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  credit: { position: 'absolute', right: 8, bottom: 8, fontFamily: k.type.caption.fontFamily, fontSize: 11, color: '#FFFFFF', backgroundColor: 'rgba(28,27,34,0.55)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  statusFloat: { position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: k.tint.green.fg, borderWidth: 3, borderColor: k.colors.surface },
  statusFloatText: { fontFamily: k.type.section.fontFamily, fontSize: 17, color: k.colors.onPrimary },
  statusFloatExample: { fontFamily: k.type.caption.fontFamily, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  detailBody: { paddingHorizontal: 16, paddingTop: 30, paddingBottom: 16, gap: 8 },
  detailTitle: { fontFamily: k.type.section.fontFamily, fontSize: 18, lineHeight: 24, color: k.colors.text },
  detailTitleLarge: { fontSize: 19, lineHeight: 26 },
  detailMeta: { fontFamily: k.type.caption.fontFamily, fontSize: 12, color: k.colors.textMuted },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  detailRowText: { fontFamily: k.type.label.fontFamily, fontSize: 15, color: k.colors.text },
  detailRowTextLarge: { fontSize: 16 },
  askChip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: k.colors.primaryFixed, marginTop: 2 },
  askText: { fontFamily: k.type.label.fontFamily, fontSize: 14, color: k.colors.primary },
  askTextLarge: { fontSize: 15 },
});
