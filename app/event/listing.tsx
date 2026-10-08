import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { KioskOutcome } from '../../features/eventKiosk/evaluate';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { chatPath, goBack, resetToHome } from '../../features/eventKiosk/ui/navigation';
import { EmptyState, FavoriteToggle, OfficialScoreBlock, OfficialScoreStateBlock, StageBadge, StatusBadge, WanpanBlock } from '../../features/eventKiosk/ui/resultParts';
import type { OfficialScoreState } from '../../features/eventKiosk/evaluate';
import { k } from '../../features/eventKiosk/ui/theme';

/** 공고 상세. 왜 이 결과인지, 왜 이 순서인지, 공고의 어디에 근거하는지. */
export default function ListingDetail() {
  const load = kioskEvent();
  const attached = useAttached();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const evaluation = useKioskStore(state => state.evaluation);
  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  // 주소의 id 는 미리 그린 화면에 없다. 이어받은 뒤에 내용을 그린다.
  if (!attached) return <KioskFrame brand={brand}><View /></KioskFrame>;

  const outcome = evaluation?.outcomes.find(item => item.id === id) ?? null;
  if (!outcome) {
    return (
      <KioskFrame brand={brand} confirmHome={false}>
        <EmptyState
          title="공고 결과를 찾을 수 없어요"
          body={evaluation ? '결과 화면에서 공고를 다시 골라 주세요.' : '처음부터 정보를 입력하면 공고별 결과를 보여 드려요.'}
          action={evaluation ? { label: '결과로 돌아가기', onPress: () => goBack('/event/results') } : { label: '처음부터 시작하기', onPress: resetToHome }}
        />
      </KioskFrame>
    );
  }

  return (
    <KioskFrame
      brand={brand}
      chatContextId={outcome.id}
      progress={{ label: `추천 순서 ${outcome.rank}번째 · 공고 상세` }}
      scrollKey={outcome.id}
      footer={
        <>
          <KioskButton label="결과 목록" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/results')} testID="detail-back" />
          <View style={styles.footerRight}>
            <FavoriteToggle outcomeId={outcome.id} />
            <KioskButton label="이 공고 AI에게 묻기" icon="forum" onPress={() => router.push(chatPath(outcome.id) as never)} large />
          </View>
        </>
      }
    >
      <Header outcome={outcome} />
      <View style={styles.sections}>
        <Why outcome={outcome} />
        <Order outcome={outcome} />
        <Conditions outcome={outcome} />
        {outcome.officialScore ? <ScoreBasis outcome={outcome} /> : null}
        <Schedule outcome={outcome} />
        <Evidence outcome={outcome} />
      </View>
    </KioskFrame>
  );
}

function Header({ outcome }: { outcome: KioskOutcome }) {
  const { listing } = outcome;
  return (
    <View style={styles.header} testID="listing-detail">
      <Text style={styles.title} accessibilityRole="header">{listing.title}</Text>
      <Text style={styles.meta}>
        {outcome.supplyType ? `${outcome.supplyLabel} · ` : ''}{listing.housingType} · {listing.address ?? listing.district}
      </Text>
      <View style={styles.badges}>
        <StatusBadge outcome={outcome} large />
        {outcome.stageLabel ? <StageBadge label={outcome.stageLabel} /> : null}
      </View>
      <View style={styles.scores}>
        {outcome.officialScore
          ? <OfficialScoreBlock score={outcome.officialScore} />
          : <OfficialScoreStateBlock state={outcome.officialScoreState as Exclude<OfficialScoreState, { status: 'AVAILABLE' }>} />}
        <WanpanBlock wanpan={outcome.wanpan} />
      </View>
      <Notice>{listing.sourceNote}</Notice>
    </View>
  );
}

function Block({ title, icon, children, testID }: { title: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; children: ReactNode; testID?: string }) {
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

function Lines({ items, tone, empty }: { items: string[]; tone: 'good' | 'bad' | 'warn' | 'plain'; empty?: string }) {
  if (!items.length) return empty ? <Text style={styles.muted}>{empty}</Text> : null;
  const icon = tone === 'good' ? 'check-circle' : tone === 'bad' ? 'cancel' : tone === 'warn' ? 'help' : 'remove';
  const color = tone === 'good' ? k.tint.green.fg : tone === 'bad' ? k.colors.error : tone === 'warn' ? k.tint.amber.fg : k.colors.textMuted;
  return (
    <View style={styles.lines}>
      {items.map(item => (
        <View key={item} style={styles.line}>
          <MaterialIcons name={icon} size={22} color={color} />
          <Text style={styles.lineText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Why({ outcome }: { outcome: KioskOutcome }) {
  const title = outcome.status === 'COMPLETE' ? '왜 신청할 수 있나요?'
    : outcome.status === 'INELIGIBLE' ? '왜 신청이 어려운가요?'
    : outcome.status === 'NEEDS_USER_INPUT' || outcome.result ? '무엇을 더 확인해야 하나요?'
    : '왜 판정하지 못했나요?';
  let body: string;
  if (outcome.status === 'COMPLETE') body = `입력하신 정보로 이 공급의 신청 조건을 모두 확인했어요${outcome.stageLabel ? `. ${outcome.stageLabel} 대상이에요` : ''}.`;
  else if (outcome.status === 'INELIGIBLE') body = '아래 조건을 채우지 못해서 이 공급은 신청이 어려워요.';
  else if (outcome.status === 'NEEDS_USER_INPUT') body = '아래 항목을 알면 신청할 수 있는지 판정할 수 있어요. 지금은 이 항목 때문에 결론을 내리지 않았어요.';
  else if (outcome.unavailableReason === 'NO_ACTIVE_RULE_SET') body = '완판e가 아직 이 공고의 신청 조건을 확인하지 않았어요. 신청할 수 있는지 판단하지 않고, 공고문을 직접 확인하시도록 안내해요.';
  else body = '공고가 서류로 확인하라고 정한 조건이 남아 있어서 결론을 내리지 않았어요. 아래 항목을 증빙으로 확인하면 판정할 수 있어요.';
  return (
    <Block title={title} icon="fact-check" testID="detail-why">
      <Text style={styles.body}>{body}</Text>
      {outcome.failed.length ? <Lines items={outcome.failed} tone="bad" /> : null}
      {outcome.missing.length ? <Lines items={outcome.missing} tone="warn" /> : null}
    </Block>
  );
}

function Order({ outcome }: { outcome: KioskOutcome }) {
  return (
    <Block title="왜 이 순서인가요?" icon="sort" testID="detail-order">
      <Text style={styles.body}>
        전체 결과 중 {outcome.rank}번째예요. 신청 가능한 공고를 먼저, 그다음 추가 확인이 필요한 공고, 신청이 어려운 공고 순서로 보여 드리고, 같은 묶음 안에서는 완판e 추천도가 높은 순서로 놓아요.
      </Text>
      <View style={styles.factors}>
        {outcome.wanpan.factors.map(factor => (
          <View key={factor.label} style={styles.factor}>
            <Text style={styles.lineText}>{factor.label}</Text>
            <Text style={[styles.factorEffect, factor.effect < 0 && { color: k.tint.amber.fg }]}>
              {factor.effect > 0 ? '▲ 앞으로' : factor.effect < 0 ? '▼ 뒤로' : '–'}
            </Text>
          </View>
        ))}
      </View>
      {outcome.stageExplanation ? <Text style={styles.muted}>공급 단계: {outcome.stageExplanation}</Text> : null}
      {outcome.regionalPriority ? <Text style={styles.muted}>지역 우선: {outcome.regionalPriority}</Text> : null}
    </Block>
  );
}

function Conditions({ outcome }: { outcome: KioskOutcome }) {
  if (!outcome.result) return null;
  return (
    <Block title="조건 확인 결과" icon="checklist" testID="detail-conditions">
      <Text style={styles.subhead}>충족한 조건 {outcome.satisfied.length}개</Text>
      <Lines items={outcome.satisfied} tone="good" empty="아직 충족을 확인한 조건이 없어요." />
      <Text style={styles.subhead}>부족하거나 확인이 필요한 조건 {outcome.failed.length + outcome.missing.length}개</Text>
      <Lines items={[...outcome.failed, ...outcome.missing]} tone="warn" empty="부족한 조건이 없어요." />
      {outcome.warnings.length ? (
        <>
          <Text style={styles.subhead}>함께 알아 둘 점</Text>
          <Lines items={outcome.warnings} tone="plain" />
        </>
      ) : null}
      {outcome.requiredDocuments.length ? (
        <>
          <Text style={styles.subhead}>준비할 서류</Text>
          <Lines items={outcome.requiredDocuments} tone="plain" />
        </>
      ) : null}
    </Block>
  );
}

function ScoreBasis({ outcome }: { outcome: KioskOutcome }) {
  const score = outcome.officialScore!;
  return (
    <Block title="공고 배점 근거" icon="gavel" testID="detail-score">
      <Text style={styles.body}>모집공고의 배점표 항목별로 계산했어요. 완판e 추천도와는 다른 값이에요.</Text>
      <View style={styles.table}>
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
    </Block>
  );
}

const fmt = (date: string | null) => (date ? date.replace(/-/g, '.') : null);

function Schedule({ outcome }: { outcome: KioskOutcome }) {
  const { listing } = outcome;
  const rows: [string, string][] = [];
  if (listing.announcementDate) rows.push(['모집공고일', fmt(listing.announcementDate)!]);
  if (listing.recruitment.startDate) {
    rows.push(['청약 접수', `${fmt(listing.recruitment.startDate)}${listing.recruitment.endDate ? ` ~ ${fmt(listing.recruitment.endDate)}` : ''}`]);
  }
  if (listing.winnerAnnouncementDate) rows.push(['당첨자 발표', fmt(listing.winnerAnnouncementDate)!]);
  if (listing.households) rows.push(['공급 세대', `${listing.households}세대`]);
  return (
    <Block title="중요 일정" icon="event" testID="detail-schedule">
      {rows.length ? (
        <View style={styles.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.lineText, { flex: 1 }]}>{label}</Text>
              <Text style={styles.points}>{value}</Text>
            </View>
          ))}
        </View>
      ) : <Text style={styles.muted}>아직 확정된 일정이 없어요. 최종 공고가 나오면 일정이 정해져요.</Text>}
    </Block>
  );
}

function Evidence({ outcome }: { outcome: KioskOutcome }) {
  const items = outcome.evidence.slice(0, 8);
  return (
    <Block title="공고 원문 근거" icon="description" testID="detail-evidence">
      {items.length ? (
        <View style={styles.lines}>
          {items.map(item => (
            <View key={item.id} style={styles.evidence}>
              <Text style={styles.subhead}>
                {item.section}{item.page ? ` · ${item.page}쪽` : ''}
              </Text>
              <Text style={styles.lineText}>{item.label}</Text>
              {item.textExcerpt ? <Text style={styles.excerpt} numberOfLines={4}>“{item.textExcerpt}”</Text> : null}
            </View>
          ))}
          {outcome.evidence.length > items.length ? <Text style={styles.muted}>외 {outcome.evidence.length - items.length}개 조항</Text> : null}
        </View>
      ) : (
        <Text style={styles.muted}>
          {outcome.listing.sourceUrl ? `공고문은 ${outcome.listing.sourceUrl.replace(/^https?:\/\//, '')}에서 확인할 수 있어요.` : '연결된 공고 원문 근거가 없어요.'}
        </Text>
      )}
    </Block>
  );
}

const styles = StyleSheet.create({
  footerRight: { flex: 1, flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' },
  header: { gap: 14 },
  title: { ...k.type.hero, color: k.colors.text },
  meta: { ...k.type.bodyLg, color: k.colors.textMuted },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  scores: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  sections: { gap: 20, marginTop: 32 },
  block: { backgroundColor: k.colors.surface, borderRadius: 20, padding: 24, gap: 14, borderWidth: 1, borderColor: k.colors.outline },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockTitle: { ...k.type.section, color: k.colors.text },
  blockBody: { gap: 12 },
  body: { ...k.type.bodyLg, color: k.colors.text },
  muted: { ...k.type.body, color: k.colors.textMuted },
  subhead: { ...k.type.bodyStrong, color: k.colors.textMuted, marginTop: 4 },
  lines: { gap: 10 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  lineText: { ...k.type.body, color: k.colors.text, flexShrink: 1 },
  factors: { gap: 8 },
  factor: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  factorEffect: { ...k.type.bodyStrong, color: k.colors.primary },
  table: { gap: 0 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: k.colors.hairline, alignItems: 'center' },
  rowTotal: { borderBottomWidth: 0 },
  points: { ...k.type.bodyLgStrong, color: k.colors.text },
  evidence: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  excerpt: { ...k.type.caption, color: k.colors.textMuted, fontStyle: 'italic' },
});
