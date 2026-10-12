import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useDensity } from '../layout/DensityContext';
import { KioskButton } from '../ui/controls';
import { k } from '../ui/theme';
import { SAMDO_BRAND } from './brandAssets';
import type { SamdoChip, SamdoResultView as Model, SamdoTone, SamdoTypeCard } from './samdoResultModel';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/**
 * 삼도이동 1지구 전용 결과.
 * 순서: 가장 유리한 신청유형 → 왜 추천하나요 → 다른 신청 가능 유형 → 신청이 어려운 유형 → 다음 행동.
 * desktop 은 추천과 다른 유형을 한 화면에 나란히, iPad 는 한 열에 넉넉히, 휴대폰은 추천 → 이유 → 대안 → 일정 순서.
 *
 * 브랜드 우선순위: 완판e 로고(맨 위 틀) → 완판이 → 공고 → 파트너(흥인코퍼레이션, 작고 흐리게).
 * 화면에서 가장 큰 글자는 추천 유형 제목이다. 머리 영역은 한 줄 높이로 낮게 둔다.
 */
const TONES: Record<SamdoTone | 'neutral', { bg: string; fg: string; icon: IconName }> = {
  eligible: { bg: k.tint.green.bg, fg: k.tint.green.fg, icon: 'check-circle' },
  review: { bg: k.tint.amber.bg, fg: k.tint.amber.fg, icon: 'help' },
  difficult: { bg: k.tint.neutral.bg, fg: k.tint.neutral.fg, icon: 'remove-circle-outline' },
  info: { bg: k.tint.purple.bg, fg: k.tint.purple.fg, icon: 'info-outline' },
  neutral: { bg: k.colors.surfaceContainer, fg: k.colors.text, icon: 'label-outline' },
};

export type SamdoActions = {
  onApplyHome: () => void;
  onAskAi: () => void;
  onSaveQr: () => void;
  /** QR 이 준비되면 그 자리에 그린다. */
  qrSlot?: ReactNode;
  qrBusy?: boolean;
};

/** 화면 틀(KioskFrame) 맨 위 브랜드 자리에 넣는 공식 완판e 로고. 원본이 없으면 null → 틀의 기본 글자 표시. */
export function SamdoBrandLogo() {
  const { density } = useDensity();
  if (!SAMDO_BRAND.logo) return null;
  const height = density === 'compact' ? 44 : density === 'comfortable' ? 50 : 38;
  return (
    <Image
      testID="samdo-wanpan-logo"
      accessibilityLabel="완판e"
      source={SAMDO_BRAND.logo.source}
      style={{ height, width: height * SAMDO_BRAND.logo.ratio }}
      resizeMode="contain"
    />
  );
}

function Chip({ chip }: { chip: SamdoChip }) {
  const { d } = useDensity();
  const tone = TONES[chip.tone];
  return (
    <View testID={chip.testID} style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[d.type.label, { color: tone.fg }]}>{chip.label}</Text>
    </View>
  );
}

function Card({ children, testID, tone, style }: { children: ReactNode; testID?: string; tone?: 'hero'; style?: object }) {
  const { d } = useDensity();
  return (
    <View testID={testID} style={[styles.card, tone === 'hero' && styles.heroCard, { padding: d.cardPadding, gap: d.cardGap }, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  const { d } = useDensity();
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.titleRow}>
        <MaterialIcons name={icon} size={d.type.section.fontSize} color={k.colors.primary} />
        <Text accessibilityRole="header" style={[d.type.section, styles.text]}>{title}</Text>
      </View>
      {hint ? <Text style={[d.type.caption, styles.muted]}>{hint}</Text> : null}
    </View>
  );
}

/** 파트너 표시. 완판e 보다 작고 흐리게, 오른쪽 끝에. */
function Partner() {
  const { density, d } = useDensity();
  const logoHeight = density === 'touch' ? 18 : 24;
  return (
    <View testID="samdo-partner" style={[styles.partner, density === 'touch' && styles.partnerTouch]}>
      <Text style={[d.type.caption, styles.subtle]}>함께하는 곳</Text>
      {SAMDO_BRAND.partnerLogo ? (
        <Image
          testID="samdo-partner-logo"
          accessibilityLabel={SAMDO_BRAND.partnerName}
          source={SAMDO_BRAND.partnerLogo.source}
          style={[styles.partnerLogo, { height: logoHeight, width: logoHeight * SAMDO_BRAND.partnerLogo.ratio }]}
          resizeMode="contain"
        />
      ) : <Text testID="samdo-partner-asset-needed" style={[d.type.caption, styles.muted]}>로고 원본 필요</Text>}
    </View>
  );
}

function Header({ model }: { model: Model }) {
  const { density, d } = useDensity();
  const character = density === 'compact' ? 52 : density === 'comfortable' ? 68 : 44;
  return (
    <View testID="samdo-header" style={[styles.header, { paddingHorizontal: d.cardPadding, paddingVertical: d.cardPadding - 6, gap: 8 }]}>
      <View style={styles.headerMain}>
        {SAMDO_BRAND.character ? (
          <Image
            testID="samdo-character"
            accessibilityLabel="완판e 캐릭터 완판이"
            source={SAMDO_BRAND.character.source}
            style={{ width: character * SAMDO_BRAND.character.ratio, height: character }}
            resizeMode="contain"
          />
        ) : <View testID="samdo-character-asset-needed" style={[styles.assetNeeded, { width: character, height: character }]}><Text style={[d.type.caption, styles.muted]}>캐릭터 원본 필요</Text></View>}
        <View style={styles.headerCopy}>
          <Text testID="samdo-title" accessibilityRole="header" style={[d.type.section, styles.text]}>{model.title}</Text>
          <View style={styles.headerMeta}>
            <Text testID="samdo-listing" style={[d.type.label, styles.muted]}>{model.subtitle}</Text>
            <View style={styles.sourceTag}><Text testID="samdo-source" style={[d.type.caption, { color: k.colors.primary }]}>{model.sourceNote}</Text></View>
          </View>
        </View>
        {density === 'touch' ? null : <Partner />}
      </View>
      {density === 'touch' ? <Partner /> : null}
    </View>
  );
}

function Hero({ model }: { model: Model }) {
  const { density, d } = useDensity();
  const hero = model.hero;
  const recommended = hero.kind === 'recommended';
  const tone = TONES[recommended ? 'eligible' : hero.kind === 'review' ? 'review' : 'difficult'];
  return (
    <Card testID="samdo-hero" tone="hero">
      <View style={[styles.eyebrow, { backgroundColor: recommended ? k.colors.primary : tone.bg }]}>
        <MaterialIcons name={recommended ? 'star' : tone.icon} size={16} color={recommended ? k.colors.onPrimary : tone.fg} />
        <Text style={[d.type.label, { color: recommended ? k.colors.onPrimary : tone.fg }]}>{hero.eyebrow}</Text>
      </View>
      <Text testID="samdo-hero-title" style={[d.type.page, styles.text]}>{hero.headline}</Text>
      <View style={styles.chips}>{hero.chips.map(chip => <Chip key={chip.testID} chip={chip} />)}</View>
      <Text style={[density === 'compact' ? d.type.caption : d.type.body, styles.muted]}>{hero.body}</Text>
      {hero.score ? (
        <View testID="samdo-hero-score-breakdown" style={[styles.scoreBox, { padding: d.cardGap, gap: 8 }]}>
          <View style={styles.scoreHead}>
            <Text style={[d.type.label, styles.muted]}>공식 가점 항목</Text>
            <Text style={[d.type.caption, styles.subtle]}>공고 배점표 기준</Text>
          </View>
          <View style={styles.scoreRow}>
            {hero.score.items.map(item => (
              <View key={item.label} style={styles.scoreItem}>
                <View style={styles.scoreLine}>
                  <Text style={[d.type.caption, styles.muted, styles.flex]} numberOfLines={1}>{item.label}</Text>
                  <Text style={[d.type.label, styles.text]}>{item.points}<Text style={[d.type.caption, styles.subtle]}>/{item.max}</Text></Text>
                </View>
                <View style={styles.scoreTrack}><View style={[styles.scoreFill, { width: `${item.max ? (item.points / item.max) * 100 : 0}%` }]} /></View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function Why({ model }: { model: Model }) {
  const { density, d } = useDensity();
  if (!model.why.length) return null;
  return (
    <Card testID="samdo-why">
      <SectionTitle icon="lightbulb-outline" title={model.hero.kind === 'recommended' ? '왜 추천하나요?' : '확인된 조건'} hint="입력한 정보로 충족한 공고 조건이에요." />
      <View style={[styles.whyList, density === 'touch' ? null : styles.whyGrid]}>
        {model.why.map((line, index) => (
          <View key={line} testID={`samdo-why-${index}`} style={[styles.bulletRow, density === 'touch' ? null : styles.whyItem]}>
            <View style={styles.checkDot}><MaterialIcons name="check" size={14} color={k.colors.onPrimary} /></View>
            <Text style={[d.type.body, styles.text, styles.flex]}>{line}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function TypeCard({ card, testID }: { card: SamdoTypeCard; testID: string }) {
  const { density, d } = useDensity();
  const tone = TONES[card.status.tone];
  return (
    <View testID={testID} style={[styles.typeCard, { borderLeftColor: tone.fg, padding: d.cardPadding - 4, gap: density === 'compact' ? 6 : d.cardGap - 6 }]}>
      <View style={styles.typeHead}>
        <Text style={[d.type.cardTitle, styles.text, styles.flex]}>{card.title}</Text>
        <View style={[styles.chip, { backgroundColor: tone.bg }]}><Text style={[d.type.label, { color: tone.fg }]}>{card.status.label}</Text></View>
      </View>
      <View style={styles.metaRow}>
        <Meta icon="flag" text={card.stage} strong />
        <Meta icon="event" text={card.applicationDate} />
        <Meta icon="home-work" text={card.supplyCount} />
        <Meta icon="leaderboard" text={card.officialScore} />
      </View>
      {card.strengths.length || card.checks.length ? (
        <View style={[styles.cardLists, density !== 'touch' && styles.cardListsRow]}>
          {card.strengths.length ? (
            <View style={[styles.listBlock, density !== 'touch' && styles.flex]}>
              {card.strengths.map(line => (
                <View key={line} style={styles.listLine}>
                  <MaterialIcons name="check" size={15} color={k.colors.success} style={styles.listIcon} />
                  <Text style={[d.type.caption, styles.text, styles.flex]} numberOfLines={2}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {card.checks.length ? (
            <View style={[styles.listBlock, density !== 'touch' && styles.flex]}>
              {card.checks.map(line => (
                <View key={line} style={styles.listLine}>
                  <MaterialIcons name="error-outline" size={15} color={k.colors.warning} style={styles.listIcon} />
                  <Text style={[d.type.caption, styles.muted, styles.flex]} numberOfLines={2}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Meta({ icon, text, strong }: { icon: IconName; text: string; strong?: boolean }) {
  const { d } = useDensity();
  return (
    <View style={styles.meta}>
      <MaterialIcons name={icon} size={15} color={strong ? k.colors.primary : k.colors.textSubtle} />
      <Text style={[strong ? d.type.label : d.type.caption, strong ? styles.text : styles.muted]}>{text}</Text>
    </View>
  );
}

function TypeGroup({ cards, columns, testID, title, hint, prefix }: {
  cards: SamdoTypeCard[];
  columns: number;
  testID: string;
  title: string;
  hint: string;
  prefix: 'alt' | 'lower';
}) {
  const { d } = useDensity();
  if (!cards.length) return null;
  return (
    <Card testID={testID}>
      <SectionTitle icon="compare-arrows" title={title} hint={hint} />
      <View style={[styles.grid, { gap: d.gridGap - 4 }]}>
        {cards.map((card, index) => (
          <View key={card.supplyType} style={{ flexBasis: columns > 1 ? `${100 / columns - 2}%` : '100%', flexGrow: 1 }}>
            <TypeCard card={card} testID={`samdo-${prefix}-${index}`} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const Alternatives = ({ model, columns }: { model: Model; columns: number }) => (
  <TypeGroup cards={model.alternatives} columns={columns} testID="samdo-alternatives" title="함께 검토할 유형" hint="신청 가능하거나 서류 확인 뒤 검토할 수 있는 유형이에요." prefix="alt" />
);

const LowerPriority = ({ model, columns }: { model: Model; columns: number }) => (
  <TypeGroup cards={model.lowerPriorityTypes} columns={columns} testID="samdo-lower-priority" title="조건 확인이 더 필요한 유형" hint="아직 입력이 부족해 추천 우선순위를 확정하지 않은 유형이에요." prefix="lower" />
);

function Rejected({ model }: { model: Model }) {
  const { d } = useDensity();
  if (!model.rejected.length) return null;
  return (
    <Card testID="samdo-rejected">
      <SectionTitle icon="block" title="신청이 어려운 유형" />
      <View style={{ gap: d.cardGap - 6 }}>
        {model.rejected.map((item, index) => (
          <View key={item.supplyType} testID={`samdo-rejected-${index}`} style={styles.rejectRow}>
            <Text style={[d.type.bodyStrong, styles.text, styles.rejectTitle]}>{item.title}</Text>
            <Text style={[d.type.caption, styles.muted, styles.rejectReason]}>{item.reason}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function InformationOnly({ model }: { model: Model }) {
  const { d } = useDensity();
  if (!model.informationOnly.length) return null;
  return (
    <Card testID="samdo-information-only">
      <SectionTitle icon="info-outline" title="정보 제공만 하는 유형" hint="기관추천은 일반 사용자 자동 추천과 순위에서 제외해요." />
      <View style={{ gap: d.cardGap - 6 }}>
        {model.informationOnly.map(item => (
          <View key={item.title} testID="samdo-info-only" style={styles.rejectRow}>
            <Text style={[d.type.bodyStrong, styles.muted, styles.rejectTitle]}>{item.title}</Text>
            <Text style={[d.type.caption, styles.subtle, styles.rejectReason]}>{item.note}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** 신청 일정. 넓은 화면은 세 날을 가로로, 휴대폰은 세로로. 내 추천 유형의 접수일을 강조한다. */
function Schedule({ model }: { model: Model }) {
  const { density, d } = useDensity();
  const horizontal = density !== 'touch';
  return (
    <Card testID="samdo-schedule">
      <SectionTitle icon="event-available" title="신청 일정" />
      <View style={[styles.scheduleList, horizontal && styles.scheduleRowList]}>
        {model.schedule.map(row => (
          <View
            key={row.id}
            testID={`samdo-schedule-${row.id}`}
            style={[styles.scheduleItem, horizontal ? styles.scheduleCell : styles.scheduleLine, row.highlight && styles.scheduleHighlight, { padding: d.cardGap - 2 }]}
          >
            <View style={horizontal ? styles.scheduleCellHead : styles.scheduleLineDate}>
              <Text style={[d.type.bodyStrong, row.highlight ? styles.primary : styles.text]}>{row.date}</Text>
              {row.highlight ? <View style={styles.mineTag}><Text style={[d.type.caption, { color: k.colors.onPrimary }]}>내 추천</Text></View> : null}
            </View>
            <View style={horizontal ? null : styles.flex}>
              <Text style={[d.type.label, styles.text]}>{row.label}</Text>
              {row.types.length ? <Text style={[d.type.caption, styles.muted]} numberOfLines={2}>{row.types.join(' · ')}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function NextActions({ model, actions }: { model: Model; actions: SamdoActions }) {
  const { density, d } = useDensity();
  return (
    <Card testID="samdo-next">
      <SectionTitle icon="checklist" title="다음 행동" />
      {model.documents.length ? (
        <View testID="samdo-documents" style={styles.listBlock}>
          <Text style={[d.type.label, styles.muted]}>준비 서류</Text>
          <View style={styles.docGrid}>
            {model.documents.map(doc => (
              <View key={doc} style={styles.doc}>
                <MaterialIcons name="check-box-outline-blank" size={18} color={k.colors.primary} />
                <Text style={[d.type.caption, styles.text, styles.flex]}>{doc}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.ctaStack}>
        <View style={styles.primaryCell}>
          <KioskButton testID="samdo-applyhome" label="청약홈에서 신청하기" icon="open-in-new" onPress={actions.onApplyHome} large={density !== 'compact'} grow />
        </View>
        <View style={styles.actions}>
          <View style={styles.actionCell}><KioskButton testID="samdo-ask-ai" label="AI에게 질문하기" icon="chat-bubble-outline" variant="soft" onPress={actions.onAskAi} grow /></View>
          <View style={styles.actionCell}><KioskButton testID="samdo-save-qr" label={actions.qrBusy ? 'QR 만드는 중' : 'QR로 결과 저장'} icon="qr-code-2" variant="soft" onPress={actions.onSaveQr} disabled={actions.qrBusy} grow /></View>
        </View>
      </View>
      {actions.qrSlot}
    </Card>
  );
}

function Notes({ model }: { model: Model }) {
  const { d } = useDensity();
  return (
    <View testID="samdo-notes" style={styles.notes}>
      {model.notes.map(line => (
        <View key={line} style={styles.bulletRow}>
          <MaterialIcons name="info-outline" size={16} color={k.colors.textSubtle} style={styles.bulletIcon} />
          <Text style={[d.type.caption, styles.subtle, styles.flex]}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

export function SamdoResultView({ model, actions }: { model: Model; actions: SamdoActions }) {
  const { density, d } = useDensity();
  const gap = density === 'compact' ? d.sectionGap - 4 : d.sectionGap;
  const hasOtherTypes = model.alternatives.length > 0 || model.lowerPriorityTypes.length > 0;
  if (density === 'compact') {
    // desktop: 첫 화면에 추천·이유와 다른 유형을 함께. 아래 줄에 어려운 유형과 다음 행동.
    return (
      <View testID="samdo-result" style={{ gap }}>
        <Header model={model} />
        <View style={[styles.row, { gap }]}>
          <View style={[styles.col, { flex: 1.2, gap }]}>
            <Hero model={model} />
            <Why model={model} />
            <Schedule model={model} />
          </View>
          <View style={[styles.col, { flex: 1, gap }]}>
            {hasOtherTypes
              ? <><Alternatives model={model} columns={1} /><LowerPriority model={model} columns={1} /></>
              : <><Rejected model={model} /><InformationOnly model={model} /></>}
          </View>
        </View>
        <View style={[styles.row, { gap }]}>
          <View style={[styles.col, { flex: 1, gap }]}>{hasOtherTypes ? <><Rejected model={model} /><InformationOnly model={model} /></> : null}</View>
          <View style={[styles.col, { flex: 1.2, gap }]}><NextActions model={model} actions={actions} /></View>
        </View>
        <Notes model={model} />
      </View>
    );
  }
  return (
    <View testID="samdo-result" style={{ gap }}>
      <Header model={model} />
      <Hero model={model} />
      <Why model={model} />
      <Alternatives model={model} columns={density === 'comfortable' ? 2 : 1} />
      <LowerPriority model={model} columns={density === 'comfortable' ? 2 : 1} />
      {density === 'touch' ? <Schedule model={model} /> : null}
      <Rejected model={model} />
      <InformationOnly model={model} />
      {density === 'touch' ? null : <Schedule model={model} />}
      <NextActions model={model} actions={actions} />
      <Notes model={model} />
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: k.colors.text },
  muted: { color: k.colors.textMuted },
  subtle: { color: k.colors.textSubtle },
  primary: { color: k.colors.primary },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { minWidth: 0 },
  card: { backgroundColor: k.colors.surface, borderRadius: k.radius.lg, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  heroCard: { borderColor: k.colors.primary, borderWidth: 2 },
  header: { backgroundColor: k.colors.surface, borderRadius: k.radius.lg, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  headerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  sourceTag: { backgroundColor: k.colors.primaryFixed, borderRadius: k.radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  partner: { alignItems: 'flex-end', gap: 2, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: k.colors.hairline },
  partnerTouch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingLeft: 0, borderLeftWidth: 0, paddingTop: 6, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  partnerLogo: { opacity: 0.85 },
  assetNeeded: { borderRadius: k.radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: k.colors.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: k.radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: k.radius.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  scoreBox: { backgroundColor: k.colors.surfaceLow, borderRadius: k.radius.md },
  scoreHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 8 },
  scoreItem: { flexGrow: 1, flexBasis: 118, gap: 4 },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scoreTrack: { height: 6, borderRadius: 3, backgroundColor: k.colors.surfaceHighest, overflow: 'hidden' },
  scoreFill: { height: 6, borderRadius: 3, backgroundColor: k.colors.primary },
  whyList: { gap: 8 },
  whyGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8 },
  whyItem: { flexBasis: 260, flexGrow: 1 },
  checkDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: k.colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletIcon: { marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  typeCard: { backgroundColor: k.colors.surface, borderRadius: k.radius.md, borderWidth: 1, borderColor: k.colors.surfaceHigh, borderLeftWidth: 4 },
  typeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  listBlock: { gap: 3 },
  listLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  listIcon: { marginTop: 2 },
  cardLists: { gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: k.colors.hairline },
  cardListsRow: { flexDirection: 'row', gap: 14 },
  rejectRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  rejectTitle: { minWidth: 150 },
  rejectReason: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  scheduleList: { gap: 8 },
  scheduleRowList: { flexDirection: 'row' },
  scheduleItem: { borderRadius: k.radius.md, backgroundColor: k.colors.surfaceLow, borderWidth: 1, borderColor: k.colors.surfaceLow },
  scheduleCell: { flex: 1, minWidth: 0, gap: 4 },
  scheduleCellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  scheduleLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scheduleLineDate: { minWidth: 104, gap: 4, alignItems: 'flex-start' },
  scheduleHighlight: { backgroundColor: k.colors.primaryFixed, borderColor: k.colors.primary },
  mineTag: { backgroundColor: k.colors.primary, borderRadius: k.radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 6, flexBasis: 220, flexGrow: 1, backgroundColor: k.colors.surfaceLow, borderRadius: k.radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  ctaStack: { gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCell: { flexDirection: 'row', flexGrow: 1, flexBasis: 200 },
  primaryCell: { flexDirection: 'row' },
  notes: { gap: 4, paddingHorizontal: 4 },
});
