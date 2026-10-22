import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, size, spacing, tint, type } from '../../../design/tokens';
import { AdminButton, EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell, useConsole } from '../../../features/adminConsole/ConsoleShell';
import { FilterGroup, LevelBadge, LoadingView, StateView } from '../../../features/adminConsole/ConsoleKit';
import { ADMIN_LOGIN_ROUTE } from '../../../features/adminPortal/navigation';
import { useAuthStore } from '../../../features/auth/useAuthStore';
import { ageLabel, ConsoleLoadError, type ConsoleLoadErrorKind } from '../../../features/adminConsole/consoleState';
import { connectedAnalytics } from '../../../features/adminConsole/source';
import { analyticsDemo, ANALYTICS_DEMO_LABEL, parseAnalyticsDemo } from '../../../features/adminConsole/analyticsDemo';
import {
  AI_MODE_META, buildAiQuality, buildFunnel, buildKpis, DEFAULT_FILTERS, ENVIRONMENT_LABEL, isFetchStale, isOperationalView,
  kstStamp, launchState, NOTICE_FILTERS, num, PERIOD_LABEL, pct, QA_FILTERS, resolveRange, scopeLabel, STATUS_META, statusRows,
  supplyRows, toQuery, TRAFFIC_LABEL, unresolvedRows, viewState,
  type AnalyticsFilters, type Delta, type KpiTile, type LaunchState, type PeriodKey, type ShareRow,
} from '../../../features/adminConsole/analyticsModel';
import type { AnalyticsSummary } from '../../../features/productV3/analytics/contract';
import type { ConsoleSnapshot } from '../../../features/adminConsole/contract';
import type { ConsoleMode } from '../../../features/adminConsole/ConsoleShell';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
type Tone = keyof typeof tint;

/**
 * 운영 지표. 대표·운영자가 30초 안에 읽는 순서:
 * 위 — 상담 시작 세션 · 판정 완료 세션 · 완료율 · 추가 확인 필요
 * 가운데 — 운영 퍼널 · 판정 결과 · 많이 막히는 조건
 * 아래 — 공급유형 · AI 상담 품질 · 지표 기준
 *
 * 숫자는 Codex 의 AnalyticsSummary 그대로다. 익명 세션은 사람 수가 아니다.
 * 공식 1.8 공고가 운영(ACTIVE)되기 전에는 real 운영 화면에 0을 늘어놓지 않고 '집계 시작 전'을 보인다.
 */
export default function ConsoleAnalytics() {
  return (
    <ConsoleShell
      menuKey="analytics"
      title="운영 지표"
      subtitle="상담이 얼마나 쓰였고, 어디서 막혔고, 어떤 결과가 나왔는지 봐요."
      testID="console-analytics"
      needs={['운영 Analytics 요약(Admin 전용)', '공고 공식 상태']}
    >
      {(snapshot, mode) => <Analytics snapshot={snapshot} mode={mode} />}
    </ConsoleShell>
  );
}

type Load =
  | { kind: 'IDLE' }
  | { kind: 'LOADING' }
  | { kind: 'READY'; summary: AnalyticsSummary; fetchedAt: number }
  | { kind: 'ERROR'; error: ConsoleLoadErrorKind; status: number | null };

function Analytics({ snapshot, mode }: { snapshot: ConsoleSnapshot; mode: ConsoleMode }) {
  const params = useLocalSearchParams<{ analytics?: string }>();
  const consoleCtx = useConsole();
  const router = useRouter();
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const demoKey = parseAnalyticsDemo(params.analytics);
  const demo = useMemo(() => (mode === 'DEMO' ? analyticsDemo(demoKey) : null), [mode, demoKey]);
  const now = demo ? demo.now : consoleCtx.now;
  const launch = useMemo(() => launchState(demo ? demo.notices : snapshot.notices, now), [demo, snapshot.notices, now]);
  const [filters, setFilters] = useState<AnalyticsFilters>(() => ({ ...DEFAULT_FILTERS, ...demo?.initialFilters }));
  useEffect(() => { setFilters({ ...DEFAULT_FILTERS, ...demo?.initialFilters }); }, [demo]);
  const [nonce, setNonce] = useState(0);
  const [load, setLoad] = useState<Load>({ kind: 'IDLE' });
  const [width, setWidth] = useState(0);
  const preLaunch = filters.trafficType === 'real' && !launch.launched;
  const query = useMemo(() => toQuery(filters, now), [filters, now]);
  const queryKey = query ? JSON.stringify(query) : null;

  useEffect(() => {
    if (!query || preLaunch) { setLoad({ kind: 'IDLE' }); return; }
    if (demo) {
      if (demo.failure) { setLoad({ kind: 'ERROR', error: demo.failure.kind, status: demo.failure.status }); return; }
      setLoad({ kind: 'READY', summary: demo.load(query), fetchedAt: now.getTime() - (demo.staleMinutes ?? 0) * 60_000 });
      return;
    }
    if (!token) { setLoad({ kind: 'ERROR', error: 'UNAUTHORIZED', status: null }); return; }
    let active = true;
    setLoad(current => (current.kind === 'READY' ? current : { kind: 'LOADING' }));
    connectedAnalytics(token, query).then(summary => {
      if (active) setLoad({ kind: 'READY', summary, fetchedAt: Date.now() });
    }).catch((error: unknown) => {
      if (active) setLoad({ kind: 'ERROR', error: error instanceof ConsoleLoadError ? error.kind : 'SERVER', status: error instanceof ConsoleLoadError ? error.status : null });
    });
    return () => { active = false; };
    // queryKey 가 바뀔 때만 다시 부른다(now 는 1분마다 흐른다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, preLaunch, demo, token, nonce, consoleCtx.refreshCount]);

  const summary = load.kind === 'READY' ? load.summary : null;
  const state = viewState(filters, launch, now, summary);
  const operational = isOperationalView(filters);
  const wide = width >= 980;
  const set = (patch: Partial<AnalyticsFilters>) => setFilters(current => ({ ...current, ...patch }));

  return (
    <View testID="analytics-root" style={styles.stack} onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {demo ? <Text testID="analytics-demo-scenario" style={styles.demoNote}>예시 상황: {ANALYTICS_DEMO_LABEL[demoKey]}</Text> : null}

      {!launch.launched && state.kind !== 'PRE_LAUNCH' ? <OfficialBanner launch={launch} /> : null}
      {!operational ? <DataKindBanner filters={filters} onOperational={() => set({ environment: 'production', trafficType: 'real' })} /> : null}

      <ScopeBar filters={filters} now={now} load={load} preLaunch={preLaunch} onChange={set} />

      {state.kind === 'PRE_LAUNCH' ? <PreLaunch launch={launch} onQa={() => set(QA_FILTERS)} /> : null}
      {state.kind === 'INVALID_RANGE' ? <EmptyState title="기간을 다시 확인해 주세요" body={state.error} /> : null}
      {state.kind !== 'PRE_LAUNCH' && state.kind !== 'INVALID_RANGE' && load.kind === 'LOADING' ? <LoadingView label="운영 지표를 불러오는 중이에요" /> : null}
      {state.kind !== 'PRE_LAUNCH' && state.kind !== 'INVALID_RANGE' && load.kind === 'ERROR'
        ? <AnalyticsError kind={load.error} status={load.status} onRetry={() => setNonce(value => value + 1)} onLogin={() => router.replace(ADMIN_LOGIN_ROUTE as Href)} />
        : null}
      {state.kind === 'EMPTY' ? (
        <View testID="analytics-empty">
          <EmptyState
            title={state.operational ? '선택한 기간에 집계된 상담 세션이 없어요' : `선택한 기간에 ${TRAFFIC_LABEL[filters.trafficType]} 기록이 없어요`}
            body={state.operational ? '운영 집계는 연결되어 있어요. 실제로 0건이에요. 기간이나 공고를 바꿔 확인해 보세요.' : '이 환경·트래픽에서 들어온 기록이 없어요. 운영 실적과는 관계없어요.'}
          />
        </View>
      ) : null}
      {state.kind === 'READY' && summary ? <Report summary={summary} wide={wide} width={width} filters={filters} /> : null}
    </View>
  );
}

/* ── 상단 배너 ──────────────────────────────────────────────────────────── */

function OfficialBanner({ launch }: { launch: LaunchState }) {
  return (
    <View testID="analytics-official-banner" accessibilityRole="summary" style={[styles.banner, { backgroundColor: tint.neutral.bg }]}>
      <MaterialIcons name="pending-actions" size={20} color={tint.neutral.fg} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerTitle, { color: tint.neutral.fg }]}>현재 운영 집계가 시작되지 않았습니다.</Text>
        <Text style={[styles.bannerBody, { color: tint.neutral.fg }]}>공식 {launch.requiredNoticeVersion} 활성화 이후 real traffic이 집계됩니다. 아래 숫자는 운영 실적이 아니에요.</Text>
        <LaunchChecks launch={launch} compact />
      </View>
    </View>
  );
}

function DataKindBanner({ filters, onOperational }: { filters: AnalyticsFilters; onOperational: () => void }) {
  return (
    <View testID="analytics-qa-banner" accessibilityRole="alert" style={[styles.banner, { backgroundColor: tint.amber.bg }]}>
      <MaterialIcons name="science" size={20} color={tint.amber.fg} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerTitle, { color: tint.amber.fg }]}>{filters.trafficType === 'real' ? '운영 외 환경의 기록' : 'QA·검증 데이터'} · 운영 실적이 아니에요</Text>
        <Text style={[styles.bannerBody, { color: tint.amber.fg }]}>{ENVIRONMENT_LABEL[filters.environment]} · {TRAFFIC_LABEL[filters.trafficType]}({filters.trafficType}) 기록만 보고 있어요. 보고·공유에 쓰지 마세요.</Text>
      </View>
      <AdminButton label="운영 데이터 보기" tone="quiet" icon="swap-horiz" onPress={onOperational} />
    </View>
  );
}

function LaunchChecks({ launch, compact }: { launch: LaunchState; compact?: boolean }) {
  return (
    <View testID="analytics-launch-checks" style={compact ? styles.checksInline : styles.checks}>
      {launch.checks.map(check => (
        <View key={check.key} style={styles.check} accessible accessibilityLabel={`${check.label} ${check.done ? '완료' : '대기'} · ${check.detail}`}>
          <MaterialIcons name={check.done ? 'check-circle' : 'radio-button-unchecked'} size={16} color={check.done ? tint.green.fg : colors.textMuted} />
          <Text style={styles.checkText}>{check.label} <Text style={styles.checkState}>{check.done ? '완료' : '대기'}</Text>{compact ? '' : ` · ${check.detail}`}</Text>
        </View>
      ))}
    </View>
  );
}

function PreLaunch({ launch, onQa }: { launch: LaunchState; onQa: () => void }) {
  return (
    <View testID="analytics-prelaunch" style={styles.hero}>
      <View style={styles.heroIcon}><MaterialIcons name="hourglass-top" size={28} color={colors.primary} /></View>
      <Text accessibilityRole="header" style={styles.heroTitle}>아직 운영 집계가 시작되지 않았어요</Text>
      <Text style={styles.heroBody}>공식 {launch.requiredNoticeVersion} 공고 활성화 후 상담 세션이 여기에 집계돼요. 집계 시작 예정: {kstStamp(launch.collectionStartAt)}.</Text>
      <Text style={styles.heroBody}>지금은 0건이 아니라 '집계 전'이에요. 숫자를 미리 채워 보이지 않아요.</Text>
      <LaunchChecks launch={launch} />
      <View style={styles.heroActions}>
        <AdminButton label="QA 데이터 보기" tone="quiet" icon="science" onPress={onQa} />
      </View>
      <Text style={styles.caption}>QA 데이터는 Staging 검증 기록이에요. 열면 화면 위에 'QA·검증 데이터' 표시가 계속 붙어요.</Text>
    </View>
  );
}

/* ── 보고 있는 데이터 · 필터 ─────────────────────────────────────────────── */

/** 지금 보는 범위는 늘 한 줄로 보이고, 조건은 필요할 때 연다(위쪽 KPI 가 첫 화면에 들어오게). 새로고침은 콘솔 공통 버튼. */
function ScopeBar({ filters, now, load, preLaunch, onChange }: {
  filters: AnalyticsFilters; now: Date; load: Load; preLaunch: boolean; onChange: (patch: Partial<AnalyticsFilters>) => void;
}) {
  const [open, setOpen] = useState(false);
  const stale = load.kind === 'READY' && isFetchStale(load.fetchedAt, now);
  const fetched = load.kind === 'READY' ? new Date(load.fetchedAt + 9 * 3_600_000).toISOString().slice(11, 16) : null;
  const age = load.kind === 'READY' ? Math.max(0, Math.floor((now.getTime() - load.fetchedAt) / 60_000)) : null;
  return (
    <View testID="analytics-scope" style={styles.scope}>
      <View style={styles.scopeHead}>
        <View style={styles.scopeCopy}>
          <Text style={styles.scopeLabel}>보고 있는 데이터</Text>
          <Text testID="analytics-scope-label" style={styles.scopeValue}>{scopeLabel(filters, now)}</Text>
          {fetched ? (
            <View testID={stale ? 'analytics-stale' : 'analytics-fetched'} style={styles.stampRow}>
              <MaterialIcons name={stale ? 'history-toggle-off' : 'schedule'} size={14} color={stale ? tint.amber.fg : colors.textMuted} />
              <Text style={[styles.caption, stale && { color: tint.amber.fg }]}>
                {stale ? '오래된 조회 · ' : ''}{fetched} 조회 기준{age !== null ? ` (${ageLabel(age)})` : ''} · 서버 집계 시각은 제공되지 않아요
              </Text>
            </View>
          ) : preLaunch ? <Text style={styles.caption}>운영 집계 시작 전이라 불러오지 않았어요.</Text> : null}
        </View>
        <View style={styles.scopeActions}>
          <AdminButton label={open ? '조건 닫기' : '조건 바꾸기'} tone="quiet" icon={open ? 'expand-less' : 'tune'} onPress={() => setOpen(!open)} />
        </View>
      </View>
      {open ? <FilterPanel filters={filters} now={now} onChange={onChange} /> : null}
    </View>
  );
}

function FilterPanel({ filters, now, onChange }: { filters: AnalyticsFilters; now: Date; onChange: (patch: Partial<AnalyticsFilters>) => void }) {
  const [from, setFrom] = useState(filters.customFrom);
  const [to, setTo] = useState(filters.customTo);
  const range = resolveRange({ ...filters, period: 'custom', customFrom: from, customTo: to }, now);
  return (
    <View testID="analytics-filters" style={styles.filters}>
      <FilterGroup<PeriodKey> label="기간" testID="analytics-period" active={filters.period}
        onChange={period => onChange({ period })}
        tabs={(Object.keys(PERIOD_LABEL) as PeriodKey[]).map(key => ({ key, label: PERIOD_LABEL[key] }))} />
      {filters.period === 'custom' ? (
        <View style={styles.dateRow}>
          <DateField label="시작일" value={from} onChange={setFrom} testID="analytics-from" />
          <DateField label="종료일" value={to} onChange={setTo} testID="analytics-to" />
          <AdminButton label="적용" icon="check" disabled={!range.ok} onPress={() => onChange({ customFrom: from.trim(), customTo: to.trim() })} />
          {!range.ok && (from || to) ? <Text testID="analytics-range-error" style={[styles.caption, { color: tint.pink.fg }]}>{range.error}</Text> : null}
        </View>
      ) : null}
      <FilterGroup<AnalyticsFilters['environment']> label="환경" testID="analytics-env" active={filters.environment}
        onChange={environment => onChange({ environment })}
        tabs={(['production', 'staging', 'preview'] as const).map(key => ({ key, label: ENVIRONMENT_LABEL[key] }))} />
      <FilterGroup<AnalyticsFilters['trafficType']> label="트래픽" testID="analytics-traffic" active={filters.trafficType}
        onChange={trafficType => onChange({ trafficType })}
        tabs={(['real', 'beta', 'internal', 'qa'] as const).map(key => ({ key, label: `${TRAFFIC_LABEL[key]} (${key})` }))} />
      <FilterGroup<AnalyticsFilters['notice']> label="공고" testID="analytics-notice" active={filters.notice}
        onChange={notice => onChange({ notice })}
        tabs={NOTICE_FILTERS.map(item => ({ key: item.key, label: item.label }))} />
      <Text style={styles.caption}>기간은 서버 기준 날짜(UTC 00시 경계)로 집계돼요. 운영 기본값은 Production · 실제 운영(real)이에요.</Text>
    </View>
  );
}

function DateField({ label, value, onChange, testID }: { label: string; value: string; onChange: (value: string) => void; testID: string }) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.caption}>{label}</Text>
      <TextInput testID={testID} accessibilityLabel={`${label} (예: 2026-10-27)`} value={value} onChangeText={onChange} placeholder="2026-10-27"
        placeholderTextColor={colors.textSubtle} inputMode="numeric" maxLength={10} style={styles.dateInput} />
    </View>
  );
}

/* ── 오류 ───────────────────────────────────────────────────────────────── */

function AnalyticsError({ kind, status, onRetry, onLogin }: { kind: ConsoleLoadErrorKind; status: number | null; onRetry: () => void; onLogin: () => void }) {
  if (kind === 'FORBIDDEN') {
    return (
      <View testID="analytics-forbidden" style={styles.hero}>
        <View style={styles.heroIcon}><MaterialIcons name="admin-panel-settings" size={28} color={colors.primary} /></View>
        <Text accessibilityRole="header" style={styles.heroTitle}>운영 지표는 관리자만 볼 수 있어요</Text>
        <Text style={styles.heroBody}>이 계정(검수자)에는 집계 조회 권한이 없어요. 다른 운영 콘솔 화면은 그대로 쓸 수 있어요. 필요하면 관리자에게 요청해 주세요.</Text>
      </View>
    );
  }
  if (kind === 'SERVER') {
    return (
      <View testID="analytics-error" style={styles.hero}>
        <View style={styles.heroIcon}><MaterialIcons name="cloud-off" size={28} color={colors.primary} /></View>
        <Text accessibilityRole="header" style={styles.heroTitle}>운영 지표를 불러오지 못했어요</Text>
        <Text style={styles.heroBody}>집계 테이블이 아직 준비되지 않았거나 서버 오류일 수 있어요. 0건으로 추정해 보이지 않아요.{status ? ` (응답 ${status})` : ''}</Text>
        <View style={styles.heroActions}><AdminButton label="다시 시도" icon="refresh" onPress={onRetry} /></View>
      </View>
    );
  }
  return <View testID={`analytics-error-${kind.toLowerCase()}`}><StateView kind={kind} status={status} onRetry={onRetry} onLogin={onLogin} /></View>;
}

/* ── 보고서 본문 ────────────────────────────────────────────────────────── */

function Report({ summary, wide, width, filters }: { summary: AnalyticsSummary; wide: boolean; width: number; filters: AnalyticsFilters }) {
  const kpis = buildKpis(summary);
  const funnel = buildFunnel(summary);
  const statuses = statusRows(summary);
  const blockers = unresolvedRows(summary);
  const supplies = supplyRows(summary);
  const ai = buildAiQuality(summary);
  const statusTotal = statuses.reduce((sum, row) => sum + row.count, 0);
  const supplyTotal = supplies.reduce((sum, row) => sum + row.count, 0);
  const cols = width >= 880 ? 4 : width >= 300 ? 2 : 1;
  const pair = (left: ReactNode, right: ReactNode) => (
    <View style={[styles.pair, wide && styles.pairWide]}>
      <View style={wide ? styles.col : null}>{left}</View>
      <View style={wide ? styles.col : null}>{right}</View>
    </View>
  );
  const noticeLabel = NOTICE_FILTERS.find(item => item.key === filters.notice)?.label ?? '전체 공고';
  return (
    <View testID="analytics-report" style={styles.stack}>
      <View testID="analytics-kpis" style={styles.grid}>
        {kpis.primary.map(tile => <Tile key={tile.key} tile={tile} cols={cols} primary />)}
      </View>
      <View testID="analytics-kpis-secondary" style={styles.grid}>
        {kpis.secondary.map(tile => <Tile key={tile.key} tile={tile} cols={cols} />)}
      </View>

      <SectionCard title="운영 퍼널" description="상담 시작부터 판정 완료까지 익명 세션 흐름이에요. 사람 수가 아니에요.">
        <View testID="analytics-funnel" style={styles.list}>
          {funnel.steps.map((step, index) => (
            <View key={step.key} style={styles.funnelStep} accessible accessibilityLabel={`${index + 1}단계 ${step.label} ${num(step.count)}세션${step.ofTotal !== null ? `, 전체 대비 ${pct(step.ofTotal)}` : ''}${step.dropFromPrevious ? `, 이전 단계에서 ${num(step.dropFromPrevious.count)}세션 이탈` : ''}`}>
              <View style={styles.rowHead}>
                <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{index + 1}</Text></View>
                <Text style={styles.rowLabel}>{step.label}</Text>
                <Text style={styles.rowValue}>{num(step.count)}<Text style={styles.unit}> 세션</Text></Text>
              </View>
              <Bar share={step.ofTotal ?? 0} tone="purple" />
              <Text style={styles.caption}>
                {index === 0 ? '기준 단계' : step.ofTotal !== null ? `전체 대비 ${pct(step.ofTotal)}` : '전체 대비 —'}
                {step.dropFromPrevious ? ` · 이전 단계에서 −${num(step.dropFromPrevious.count)}세션 (${pct(step.dropFromPrevious.rate)} 이탈)` : ''}
              </Text>
              {step.anomaly ? (
                <View style={styles.inlineNote}>
                  <MaterialIcons name="info-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.caption}>이전 단계보다 많아요. 상담 시작 기록이 빠진 세션이 있을 수 있어요(이탈로 계산하지 않아요).</Text>
                </View>
              ) : null}
            </View>
          ))}
          <View style={styles.divider} />
          <Text style={styles.subhead}>판정 이후 행동 · 횟수</Text>
          <Text style={styles.caption}>조회·저장·QR은 세션이 아니라 횟수예요. 한 세션이 여러 번 할 수 있어 위 단계와 비율을 내지 않아요.</Text>
          <View style={styles.afterRow}>
            {funnel.afterActions.map(action => (
              <View key={action.key} style={styles.afterItem} accessible accessibilityLabel={`${action.label} ${num(action.count)}회`}>
                <Text style={styles.caption}>{action.label}</Text>
                <Text style={styles.afterValue}>{num(action.count)}<Text style={styles.unit}> 회</Text></Text>
                <Text style={styles.caption}>{action.perCompleted === null ? '완료 세션 없음' : `완료 세션당 ${action.perCompleted.toFixed(1)}회`}</Text>
              </View>
            ))}
          </View>
        </View>
      </SectionCard>

      {pair(
        <SectionCard title="판정 결과" description={`공급유형별 판정 결과 ${num(statusTotal)}건 기준이에요. 한 세션에서 공고·공급유형마다 결과가 하나씩 나와요.`}>
          <View testID="analytics-status" style={styles.list}>
            {statuses.map(row => (
              <DistRow key={row.key} row={row} unit="건" icon={STATUS_META[row.key as keyof typeof STATUS_META].icon} tone={STATUS_META[row.key as keyof typeof STATUS_META].tone}
                hint={STATUS_META[row.key as keyof typeof STATUS_META].hint} showShare />
            ))}
          </View>
        </SectionCard>,
        <SectionCard title="많이 막히는 조건" description="답이 부족해 판정을 끝내지 못한 조건이에요. 같은 세션의 같은 조건은 한 번만 세요.">
          <View testID="analytics-unresolved" style={styles.list}>
            {blockers.length ? blockers.map((row, index) => (
              <DistRow key={row.key} row={row} unit="세션" rank={index + 1} tone="amber" />
            )) : <Text style={styles.caption}>이 기간에 막힌 조건 기록이 없어요.</Text>}
          </View>
        </SectionCard>,
      )}

      {pair(
        <SectionCard title="공급유형" description={`${noticeLabel} · 공급유형별 판정 결과 ${num(supplyTotal)}건이에요. 자격 판정 결과이며 당첨과는 관계없어요.`}>
          <View testID="analytics-supply" style={styles.list}>
            {supplies.map(row => <DistRow key={row.key} row={row} unit="건" tone="purple" showShare />)}
            <View style={styles.inlineNote}>
              <MaterialIcons name="info-outline" size={14} color={colors.textMuted} />
              <Text style={styles.caption}>공급유형마다 완료·추가 확인·신청 어려움으로 나눈 집계는 아직 제공되지 않아요. 전체 비율은 위 '판정 결과'에서 봐요.</Text>
            </View>
          </View>
        </SectionCard>,
        <SectionCard title="AI 상담 품질" description={ai.total ? `AI 상담 사용 ${num(ai.total)}회 · 대체 답변 ${pct(ai.fallbackRate)}` : 'AI 상담 기록이 없어요'}>
          <View testID="analytics-ai" style={styles.list}>
            {ai.warnings.length ? (
              <View testID="analytics-ai-warnings" style={styles.list}>
                {ai.warnings.map(warning => (
                  <View key={warning.title} style={styles.warning} accessible accessibilityLabel={`${warning.title}. ${warning.body}`}>
                    <LevelBadge level={warning.level} />
                    <View style={styles.warningCopy}>
                      <Text style={styles.rowLabel}>{warning.title}</Text>
                      <Text style={styles.caption}>{warning.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : ai.total ? (
              <View style={styles.inlineNote}>
                <MaterialIcons name="check-circle" size={16} color={tint.green.fg} />
                <Text style={styles.caption}>제공자 오류·높은 대체 비율이 없어요.</Text>
              </View>
            ) : null}
            {ai.total ? (
              <>
                <Text style={styles.subhead}>답변 방식</Text>
                {ai.modes.map(row => <DistRow key={row.key} row={row} unit="회" icon={AI_MODE_META[row.key as keyof typeof AI_MODE_META].icon} tone="purple" showShare />)}
                <Text style={styles.subhead}>대체 사유</Text>
                {ai.reasons.length ? ai.reasons.map(row => <DistRow key={row.key} row={row} unit="회" icon={row.icon as IconName} tone="neutral" />)
                  : <Text style={styles.caption}>대체 답변이 없어요.</Text>}
                <View style={styles.afterRow}>
                  <View style={styles.afterItem}><Text style={styles.caption}>평균 대화</Text><Text style={styles.afterValue}>{ai.averageTurns === null ? '—' : ai.averageTurns.toFixed(1)}<Text style={styles.unit}> 턴</Text></Text><Text style={styles.caption}>AI 상담을 쓴 세션 기준</Text></View>
                </View>
              </>
            ) : null}
            <Text style={styles.subhead}>세션 소요시간</Text>
            {ai.durations.some(row => row.count) ? ai.durations.map(row => <DistRow key={row.key} row={row} unit="세션" tone="neutral" showShare />)
              : <Text style={styles.caption}>종료된 세션 기록이 없어요.</Text>}
          </View>
        </SectionCard>,
      )}

      <SectionCard title="지표 기준" description="숫자를 읽는 법이에요. 보고할 때 같이 적어 주세요.">
        <View testID="analytics-definitions" style={styles.list}>
          {[
            '세션은 기기에서 새로 만든 익명 ID예요. 같은 사람이 다시 시작하면 다른 세션이에요. 사람 수로 쓰지 마세요.',
            '완료율 = 판정을 시작한 세션 중 판정 결과를 받은 세션 비율이에요(공급유형 건수가 아니에요).',
            '판정 결과·공급유형은 공고 × 공급유형마다 한 건씩 세요. 세션 수보다 커요.',
            '결과 조회·저장·QR 생성은 횟수예요. QR 토큰, 이름, 연락처, 소득·자산 값, 대화 원문은 저장하지 않아요.',
            '이전 기간 비교는 같은 길이의 바로 앞 기간이에요. 상담 시작·판정 완료·완료율만 제공돼요.',
          ].map(line => (
            <View key={line} style={styles.bullet}><Text style={styles.caption}>·</Text><Text style={[styles.caption, styles.flex]}>{line}</Text></View>
          ))}
        </View>
      </SectionCard>
    </View>
  );
}

const DELTA_ICON: Record<Delta['direction'], IconName> = { up: 'north-east', down: 'south-east', flat: 'east', none: 'remove' };

function Tile({ tile, cols, primary }: { tile: KpiTile; cols: number; primary?: boolean }) {
  return (
    <View style={[styles.tileWrap, { width: `${100 / cols}%` }]}>
      <View testID={`analytics-kpi-${tile.key}`} style={[styles.tile, primary && styles.tilePrimary]} accessible
        accessibilityLabel={`${tile.label} ${tile.value}${tile.unit}. ${tile.basis}.${primary && tile.delta.direction !== 'none' ? ` ${tile.delta.text}.` : ''}`}>
        <View style={styles.tileTop}>
          <Text style={styles.tileLabel}>{tile.label}</Text>
          <MaterialIcons name={tile.icon as IconName} size={18} color={colors.primary} />
        </View>
        <Text style={primary ? styles.tileValue : styles.tileValueSm}>{tile.value}{tile.unit ? <Text style={styles.unit}> {tile.unit}</Text> : null}</Text>
        <Text style={styles.caption}>{tile.basis}</Text>
        {primary ? (
          <View style={styles.inlineNote}>
            <MaterialIcons name={DELTA_ICON[tile.delta.direction]} size={14} color={colors.textMuted} />
            <Text style={styles.caption}>{tile.delta.text}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DistRow({ row, unit, icon, tone, rank, hint, showShare }: { row: ShareRow; unit: string; icon?: IconName; tone: Tone; rank?: number; hint?: string; showShare?: boolean }) {
  return (
    <View style={styles.dist} accessible accessibilityLabel={`${rank ? `${rank}위 ` : ''}${row.label} ${num(row.count)}${unit}${showShare ? `, ${pct(row.share)}` : ''}`}>
      <View style={styles.rowHead}>
        {rank ? <Text style={styles.rank}>{rank}.</Text> : null}
        {icon ? <View style={[styles.distIcon, { backgroundColor: tint[tone].bg }]}><MaterialIcons name={icon} size={16} color={tint[tone].fg} /></View> : null}
        <View style={styles.flex}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.raw}>{row.raw}{hint ? ` · ${hint}` : ''}</Text>
        </View>
        <Text style={styles.rowValue}>{num(row.count)}<Text style={styles.unit}> {unit}</Text>{showShare ? <Text style={styles.share}> · {pct(row.share)}</Text> : null}</Text>
      </View>
      <Bar share={row.share} tone={tone} />
    </View>
  );
}

function Bar({ share, tone }: { share: number; tone: Tone }) {
  return (
    <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, share)) * 100}%`, backgroundColor: tint[tone].fg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 12 },
  caption: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  demoNote: { ...type.caption, color: tint.amber.fg },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: spacing.md, borderRadius: radius.cardSm, flexWrap: 'wrap' },
  bannerCopy: { flex: 1, minWidth: 220, gap: 4 },
  bannerTitle: { ...type.bodySmStrong },
  bannerBody: { ...type.bodySm },
  checks: { gap: 6, alignSelf: 'stretch' },
  checksInline: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 4, marginTop: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, flexShrink: 1 },
  checkText: { ...type.caption, color: colors.text, flexShrink: 1 },
  checkState: { fontFamily: type.label.fontFamily },
  hero: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  heroIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: tint.purple.bg, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { ...type.cardTitle, color: colors.text },
  heroBody: { ...type.body, color: colors.textMuted },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  scope: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.md },
  scopeHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  scopeCopy: { flex: 1, minWidth: 220, gap: 2 },
  scopeLabel: { ...type.caption, color: colors.textMuted },
  scopeValue: { ...type.bodySmStrong, color: colors.text },
  scopeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  filters: { gap: spacing.sm },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  dateField: { gap: 2, flexGrow: 1, flexBasis: 140, maxWidth: 220 },
  dateInput: { ...type.body, color: colors.text, minHeight: size.touch, paddingHorizontal: 12, borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, rowGap: spacing.sm },
  tileWrap: { paddingHorizontal: spacing.xs },
  tile: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: 4, flexGrow: 1 },
  tilePrimary: { minHeight: 148 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  tileLabel: { ...type.bodySmStrong, color: colors.text, flexShrink: 1 },
  tileValue: { ...type.display, color: colors.text },
  tileValueSm: { ...type.section, color: colors.text },
  unit: { ...type.bodySm, color: colors.textMuted },
  share: { ...type.bodySm, color: colors.textMuted },
  inlineNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  funnelStep: { gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowLabel: { ...type.bodySmStrong, color: colors.text, flexShrink: 1 },
  rowValue: { ...type.bodyStrong, color: colors.text, marginLeft: 'auto' },
  raw: { ...type.micro, color: colors.textSubtle, flexShrink: 1 },
  rank: { ...type.bodySmStrong, color: colors.textMuted, minWidth: 20 },
  stepBadge: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: tint.purple.bg, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { ...type.caption, color: tint.purple.fg, fontFamily: type.label.fontFamily },
  track: { height: size.bar, borderRadius: 4, backgroundColor: colors.surfaceContainer, overflow: 'hidden' },
  fill: { height: size.bar, borderRadius: 4 },
  divider: { height: 1, backgroundColor: colors.surfaceHigh, marginVertical: 4 },
  subhead: { ...type.label, color: colors.text, marginTop: 4 },
  afterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  afterItem: { flexGrow: 1, flexBasis: 140, gap: 2, padding: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceLow },
  afterValue: { ...type.section, color: colors.text },
  pair: { gap: spacing.md },
  pairWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  dist: { gap: 6 },
  distIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', padding: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceLow },
  warningCopy: { flex: 1, minWidth: 180, gap: 2 },
  bullet: { flexDirection: 'row', gap: 6 },
});
