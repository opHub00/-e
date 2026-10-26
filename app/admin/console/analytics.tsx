import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, size, spacing, tint, type } from '../../../design/tokens';
import { AdminButton, EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell, useConsole, type ConsoleMode } from '../../../features/adminConsole/ConsoleShell';
import { FilterGroup, LevelBadge, LoadingView } from '../../../features/adminConsole/ConsoleKit';
import { ADMIN_LOGIN_ROUTE } from '../../../features/adminPortal/navigation';
import { useAuthStore } from '../../../features/auth/useAuthStore';
import { AnalyticsLoadError, connectedAnalytics } from '../../../features/adminConsole/source';
import { analyticsDemo, ANALYTICS_DEMO_LABEL, ANALYTICS_DEMO_NOTICES, parseAnalyticsDemo } from '../../../features/adminConsole/analyticsDemo';
import {
  AI_MODE_META, ANALYTICS_ERROR_COPY, analyticsErrorCode, buildAiQuality, buildFunnel, buildKpis, COLLECTION_META, collectionStateOf,
  DEFAULT_FILTERS, ENVIRONMENT_LABEL, freshness, isOperationalView, kstStamp, launchChecks, noticeFilterOptions, noticeLabel, num, PERIOD_LABEL, pct,
  collectionOf, QA_FILTERS, resolveRange, scopeLabel, STATUS_META, statusRows, supplyStatusRows, toQuery, TRAFFIC_LABEL, unresolvedRows, viewState,
  type AnalyticsErrorCode, type AnalyticsFilters, type NoticeOption, type CollectionStateView, type Delta, type FunnelStep, type KpiTile, type PeriodKey, type ShareRow,
} from '../../../features/adminConsole/analyticsModel';
import type { AnalyticsSummary } from '../../../features/productV3/analytics/contract';
import type { ConsoleSnapshot } from '../../../features/adminConsole/contract';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
type Tone = keyof typeof tint;

/**
 * 운영 지표(계약 v2). 대표·운영자가 30초 안에 읽는 순서:
 * 위 — 상담 시작 세션 · 판정 완료 세션 · 완료율 · 추가 확인 필요
 * 가운데 — 운영 퍼널 · 판정 결과 · 많이 막히는 조건
 * 아래 — 공급유형별 판정 · AI 품질 · 결과 저장/QR 행동
 *
 * 숫자와 운영 상태(collectionState)는 Codex 의 AnalyticsSummary 그대로다. 익명 세션은 사람 수가 아니다.
 * 실제 운영(real) 화면은 서버가 숫자를 보일 상태라고 할 때만 숫자를 보인다.
 */
export default function ConsoleAnalytics() {
  return (
    <ConsoleShell
      menuKey="analytics"
      title="운영 지표"
      subtitle="상담이 얼마나 쓰였고, 어디서 막혔고, 어떤 결과가 나왔는지 봐요."
      testID="console-analytics"
      needs={['운영 Analytics 요약(Admin 전용)', '서버 집계 상태(collectionState)']}
    >
      {(snapshot, mode) => <Analytics snapshot={snapshot} mode={mode} />}
    </ConsoleShell>
  );
}

type Load =
  | { kind: 'IDLE' }
  | { kind: 'LOADING' }
  | { kind: 'READY'; summary: AnalyticsSummary }
  | { kind: 'ERROR'; code: AnalyticsErrorCode; status: number | null };

function Analytics({ snapshot, mode }: { snapshot: ConsoleSnapshot; mode: ConsoleMode }) {
  const params = useLocalSearchParams<{ analytics?: string }>();
  const consoleCtx = useConsole();
  const router = useRouter();
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const demoKey = parseAnalyticsDemo(params.analytics);
  const demo = useMemo(() => (mode === 'DEMO' ? analyticsDemo(demoKey) : null), [mode, demoKey]);
  const now = demo ? demo.now : consoleCtx.now;
  // 공고 필터 목록은 서버가 준 공고(id·제목)로 만든다. 예시 화면은 fixture 목록.
  const notices: NoticeOption[] = useMemo(() => (demo ? ANALYTICS_DEMO_NOTICES
    : snapshot.notices.map(notice => ({ id: notice.id, title: notice.title }))), [demo, snapshot.notices]);
  const [filters, setFilters] = useState<AnalyticsFilters>(() => ({ ...DEFAULT_FILTERS, ...demo?.initialFilters }));
  useEffect(() => { setFilters({ ...DEFAULT_FILTERS, ...demo?.initialFilters }); }, [demo]);
  const [nonce, setNonce] = useState(0);
  const [load, setLoad] = useState<Load>({ kind: 'IDLE' });
  const [width, setWidth] = useState(0);
  const query = useMemo(() => toQuery(filters, now), [filters, now]);
  const queryKey = query ? JSON.stringify(query) : null;

  // 실제 운영 화면도 늘 서버에 묻는다. 개시 여부는 서버 collectionState 가 정한다.
  useEffect(() => {
    if (!query) { setLoad({ kind: 'IDLE' }); return; }
    if (demo) {
      if (demo.failure) { setLoad({ kind: 'ERROR', code: analyticsErrorCode(demo.failure.status, demo.failure.code, demo.failure.transport), status: demo.failure.status }); return; }
      setLoad({ kind: 'READY', summary: demo.load(query) });
      return;
    }
    if (!token) { setLoad({ kind: 'ERROR', code: 'AUTH_REQUIRED', status: null }); return; }
    let active = true;
    setLoad(current => (current.kind === 'READY' ? current : { kind: 'LOADING' }));
    connectedAnalytics(token, query).then(summary => {
      if (active) setLoad({ kind: 'READY', summary });
    }).catch((error: unknown) => {
      if (active) setLoad({ kind: 'ERROR', code: error instanceof AnalyticsLoadError ? error.code : 'ANALYTICS_READ_FAILED', status: error instanceof AnalyticsLoadError ? error.status : null });
    });
    return () => { active = false; };
    // queryKey 가 바뀔 때만 다시 부른다(now 는 1분마다 흐른다). 콘솔 새로고침(refreshCount)도 다시 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, demo, token, nonce, consoleCtx.refreshCount]);

  const summary = load.kind === 'READY' ? load.summary : null;
  const state = viewState(filters, now, summary);
  const operational = isOperationalView(filters);
  const wide = width >= 980;
  const set = (patch: Partial<AnalyticsFilters>) => setFilters(current => ({ ...current, ...patch }));

  return (
    <View testID="analytics-root" style={styles.stack} onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {demo ? <Text testID="analytics-demo-scenario" style={styles.demoNote}>예시 상황: {ANALYTICS_DEMO_LABEL[demoKey]}</Text> : null}

      {!operational ? <DataKindBanner filters={filters} summary={summary} onOperational={() => set({ environment: 'production', trafficType: 'real' })} /> : null}
      {operational && summary && collectionStateOf(summary) === 'PAUSED' ? <CollectionBanner state="PAUSED" /> : null}

      <ScopeBar filters={filters} now={now} summary={summary} notices={notices} onChange={set} />

      {state.kind === 'INVALID_RANGE' ? <EmptyState title="기간을 다시 확인해 주세요" body={state.error} /> : null}
      {state.kind === 'WAITING' && (load.kind === 'LOADING' || load.kind === 'IDLE') ? <LoadingView label="운영 지표를 불러오는 중이에요" /> : null}
      {state.kind === 'WAITING' && load.kind === 'ERROR'
        ? <AnalyticsError code={load.code} status={load.status} onRetry={() => setNonce(value => value + 1)} onLogin={() => router.replace(ADMIN_LOGIN_ROUTE as Href)} />
        : null}
      {state.kind === 'STORE_UNAVAILABLE' ? (
        <View testID="analytics-store-unavailable" style={styles.hero}>
          <View style={styles.heroIcon}><MaterialIcons name="storage" size={28} color={colors.primary} /></View>
          <Text accessibilityRole="header" style={styles.heroTitle}>{ENVIRONMENT_LABEL[state.environment]} 운영 지표 저장소가 아직 연결되지 않았어요</Text>
          <Text style={styles.heroBody}>0건이 아니라 읽을 저장소가 없는 상태예요. Staging 기록을 {ENVIRONMENT_LABEL[state.environment]} 숫자로 대신 보여 주지 않아요.</Text>
          <View style={styles.heroActions}><AdminButton label="QA 데이터 보기" tone="quiet" icon="science" onPress={() => set(QA_FILTERS)} /></View>
        </View>
      ) : null}
      {state.kind === 'COLLECTION_GATE' && summary ? <CollectionHero state={state.state} summary={summary} onQa={() => set(QA_FILTERS)} /> : null}
      {state.kind === 'EMPTY' ? (
        <View testID="analytics-empty">
          <EmptyState
            title={state.operational ? '선택한 기간에 집계된 상담 세션이 없어요' : `선택한 기간에 ${TRAFFIC_LABEL[filters.trafficType]} 기록이 없어요`}
            body={state.operational ? '운영 집계는 진행 중이에요. 이 기간에는 실제로 0건이에요. 기간이나 공고를 바꿔 확인해 보세요.' : '이 환경·트래픽에서 들어온 기록이 없어요. 운영 실적과는 관계없어요.'}
          />
        </View>
      ) : null}
      {state.kind === 'READY' && summary ? <Report summary={summary} wide={wide} width={width} filters={filters} notices={notices} operational={state.operational} /> : null}
    </View>
  );
}

/* ── 상단 배너 · 집계 상태 ──────────────────────────────────────────────── */

/** QA·검증 기록: 어디서도 운영 실적으로 읽히지 않게. 공식 데이터 준비 여부는 서버 값만. */
function DataKindBanner({ filters, summary, onOperational }: { filters: AnalyticsFilters; summary: AnalyticsSummary | null; onOperational: () => void }) {
  const collection = collectionOf(summary);
  return (
    <View testID="analytics-qa-banner" accessibilityRole="alert" style={[styles.banner, { backgroundColor: tint.amber.bg }]}>
      <MaterialIcons name="science" size={20} color={tint.amber.fg} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerTitle, { color: tint.amber.fg }]}>{filters.trafficType === 'real' ? '운영 외 환경의 기록' : 'QA·검증 데이터'} · 운영 실적이 아니에요</Text>
        <Text style={[styles.bannerBody, { color: tint.amber.fg }]}>{ENVIRONMENT_LABEL[filters.environment]} · {TRAFFIC_LABEL[filters.trafficType]}({filters.trafficType}) 기록만 보고 있어요. 보고·공유에 쓰지 마세요.</Text>
        {collection && !collection.officialDataReady ? (
          <View testID="analytics-official-banner" style={styles.inlineNote}>
            <MaterialIcons name="pending-actions" size={16} color={tint.amber.fg} />
            <Text style={[styles.bannerBody, { color: tint.amber.fg }]}>현재 운영 집계가 시작되지 않았습니다. 공식 {collection.requiredNoticeVersion} 활성화 이후 real traffic이 집계됩니다 ({kstStamp(collection.collectionStartAt)} 예정).</Text>
          </View>
        ) : collection ? (
          <Text style={[styles.bannerBody, { color: tint.amber.fg }]}>운영(real) 집계 상태: {COLLECTION_META[collection.collectionState].label} · 이 화면의 숫자와는 별개예요.</Text>
        ) : null}
      </View>
      <AdminButton label="운영 데이터 보기" tone="quiet" icon="swap-horiz" onPress={onOperational} />
    </View>
  );
}

function CollectionBanner({ state }: { state: CollectionStateView }) {
  const meta = COLLECTION_META[state];
  return (
    <View testID={`analytics-collection-${state.toLowerCase()}`} accessibilityRole="alert" style={[styles.banner, { backgroundColor: tint.amber.bg }]}>
      <MaterialIcons name={meta.icon as IconName} size={20} color={tint.amber.fg} />
      <View style={styles.bannerCopy}>
        <View style={styles.rowHead}>{meta.level ? <LevelBadge level={meta.level} /> : null}<Text style={[styles.bannerTitle, { color: tint.amber.fg }]}>{meta.title}</Text></View>
        <Text style={[styles.bannerBody, { color: tint.amber.fg }]}>{meta.body}</Text>
      </View>
    </View>
  );
}

/** 실제 운영 화면에서 숫자 대신 보이는 집계 상태(PRE_LAUNCH · READY_NOT_STARTED · MISCONFIGURED · 상태 미제공). */
function CollectionHero({ state, summary, onQa }: { state: CollectionStateView; summary: AnalyticsSummary; onQa: () => void }) {
  const meta = COLLECTION_META[state];
  // 설정 오류·상태 미제공이면 체크리스트를 보이지 않는다(잘못된 설정 옆에 '완료'가 붙어 헷갈리지 않게).
  const checks = state === 'MISCONFIGURED' || state === 'UNKNOWN' ? [] : launchChecks(summary);
  return (
    <View testID={`analytics-collection-${state.toLowerCase()}`} style={styles.hero}>
      <View style={styles.heroIcon}><MaterialIcons name={meta.icon as IconName} size={28} color={colors.primary} /></View>
      <View style={styles.rowHead}>
        {meta.level && meta.level !== 'INFO' ? <LevelBadge level={meta.level} /> : null}
        <Text accessibilityRole="header" style={styles.heroTitle}>{meta.title}</Text>
      </View>
      <Text style={styles.heroBody}>{meta.body}</Text>
      {collectionOf(summary) ? <Text style={styles.raw}>서버 전역 상태 {collectionOf(summary)!.collectionState}{storeUnavailableNote(summary)}</Text> : null}
      {checks.length ? (
        <View testID="analytics-launch-checks" style={styles.checks}>
          {checks.map(check => (
            <View key={check.key} style={styles.check} accessible accessibilityLabel={`${check.label} ${check.done ? '완료' : '대기'} · ${check.detail}`}>
              <MaterialIcons name={check.done ? 'check-circle' : 'radio-button-unchecked'} size={16} color={check.done ? tint.green.fg : colors.textMuted} />
              <Text style={styles.checkText}>{check.label} <Text style={styles.checkState}>{check.done ? '완료' : '대기'}</Text> · {check.detail}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.heroActions}>
        <AdminButton label="QA 데이터 보기" tone="quiet" icon="science" onPress={onQa} />
      </View>
      <Text style={styles.caption}>QA 데이터는 Staging 검증 기록이에요. 열면 화면 위에 'QA·검증 데이터' 표시가 계속 붙어요.</Text>
    </View>
  );
}

/* ── 보고 있는 데이터 · 신선도 · 필터 ────────────────────────────────────── */

/** 지금 보는 범위는 늘 한 줄. 집계 생성 시각과 마지막 이벤트 시각은 따로 적는다. 새로고침은 콘솔 공통 버튼. */
function ScopeBar({ filters, now, summary, notices, onChange }: {
  filters: AnalyticsFilters; now: Date; summary: AnalyticsSummary | null; notices: NoticeOption[]; onChange: (patch: Partial<AnalyticsFilters>) => void;
}) {
  const [open, setOpen] = useState(false);
  const fresh = summary ? freshness(summary, filters, now) : null;
  return (
    <View testID="analytics-scope" style={styles.scope}>
      <View style={styles.scopeHead}>
        <View style={styles.scopeCopy}>
          <Text style={styles.scopeLabel}>보고 있는 데이터</Text>
          <Text testID="analytics-scope-label" style={styles.scopeValue}>{scopeLabel(filters, now, notices)}</Text>
          {fresh ? (
            <View testID="analytics-freshness" style={styles.freshList}>
              <View style={styles.stampRow}>
                <MaterialIcons name="schedule" size={14} color={colors.textMuted} />
                <Text testID="analytics-generated" style={styles.caption}>집계 생성 {fresh.generated ?? '서버가 제공하지 않음'}</Text>
              </View>
              <View style={styles.stampRow}>
                <MaterialIcons name={fresh.lastEvent?.stale ? 'history-toggle-off' : 'bolt'} size={14} color={fresh.lastEvent?.stale ? tint.amber.fg : colors.textMuted} />
                <Text testID={fresh.noEvents ? 'analytics-no-events' : fresh.lastEvent?.stale ? 'analytics-stale' : 'analytics-last-event'} style={[styles.caption, fresh.lastEvent?.stale && styles.staleText]}>
                  {fresh.noEvents ? '마지막 이벤트 · 아직 기록된 이벤트가 없습니다'
                    : fresh.lastEvent ? `마지막 이벤트 ${fresh.lastEvent.text}${fresh.lastEvent.stale ? ' · 오래된 데이터 · 수집이 멈췄는지 확인해 주세요' : ''}`
                      : '마지막 이벤트 · 서버가 제공하지 않음'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.scopeActions}>
          <AdminButton label={open ? '조건 닫기' : '조건 바꾸기'} tone="quiet" icon={open ? 'expand-less' : 'tune'} onPress={() => setOpen(!open)} />
        </View>
      </View>
      {open ? <FilterPanel filters={filters} now={now} notices={notices} onChange={onChange} /> : null}
    </View>
  );
}

function FilterPanel({ filters, now, notices, onChange }: { filters: AnalyticsFilters; now: Date; notices: NoticeOption[]; onChange: (patch: Partial<AnalyticsFilters>) => void }) {
  const [from, setFrom] = useState(filters.customFrom);
  const [to, setTo] = useState(filters.customTo);
  const range = resolveRange({ ...filters, period: 'custom', customFrom: from, customTo: to }, now);
  return (
    <View testID="analytics-filters" style={styles.filters}>
      <FilterGroup<PeriodKey> label="기간 (KST)" testID="analytics-period" active={filters.period}
        onChange={period => onChange({ period })}
        tabs={(Object.keys(PERIOD_LABEL) as PeriodKey[]).map(key => ({ key, label: PERIOD_LABEL[key] }))} />
      {filters.period === 'custom' ? (
        <View style={styles.dateRow}>
          <DateField label="시작일 (KST)" value={from} onChange={setFrom} testID="analytics-from" />
          <DateField label="종료일 (KST)" value={to} onChange={setTo} testID="analytics-to" />
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
        tabs={noticeFilterOptions(notices)} />
      <Text style={styles.caption}>기간은 한국 시간(KST) 날짜 기준이에요. 시작일 00:00부터 종료일 24:00 전까지 집계돼요. 운영 기본값은 Production · 실제 운영(real)이에요.</Text>
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

/* ── 오류(안정 코드별 문구) ─────────────────────────────────────────────── */

function AnalyticsError({ code, status, onRetry, onLogin }: { code: AnalyticsErrorCode; status: number | null; onRetry: () => void; onLogin: () => void }) {
  const copy = ANALYTICS_ERROR_COPY[code];
  return (
    <View testID={`analytics-error-${code.toLowerCase()}`} style={styles.hero} accessibilityRole="alert">
      <View style={styles.heroIcon}><MaterialIcons name={copy.icon as IconName} size={28} color={colors.primary} /></View>
      <Text accessibilityRole="header" style={styles.heroTitle}>{copy.title}</Text>
      <Text style={styles.heroBody}>{copy.body}</Text>
      <Text style={styles.raw}>{code}{status ? ` · 응답 ${status}` : ''}</Text>
      {copy.action !== 'NONE' ? (
        <View style={styles.heroActions}>
          {copy.action === 'LOGIN' ? <AdminButton label="로그인" icon="login" onPress={onLogin} /> : <AdminButton label="다시 시도" icon="refresh" onPress={onRetry} />}
        </View>
      ) : null}
    </View>
  );
}

/* ── 보고서 본문 ────────────────────────────────────────────────────────── */

function Report({ summary, wide, width, filters, notices, operational }: { summary: AnalyticsSummary; wide: boolean; width: number; filters: AnalyticsFilters; notices: NoticeOption[]; operational: boolean }) {
  const kpis = buildKpis(summary);
  const funnel = buildFunnel(summary);
  const statuses = statusRows(summary);
  const blockers = unresolvedRows(summary);
  const supplies = supplyStatusRows(summary);
  const ai = buildAiQuality(summary);
  const statusTotal = statuses.reduce((sum, row) => sum + row.count, 0);
  const cols = width >= 880 ? 4 : width >= 300 ? 2 : 1;
  const supplyCols = width >= 1100 ? 3 : width >= 620 ? 2 : 1;
  // QA·검증 기록이면 모든 카드 설명 앞에 붙인다(스크롤해도 운영 실적으로 읽히지 않게).
  const tag = operational ? '' : `QA·검증 기록(${filters.environment}·${filters.trafficType}) · `;
  const pair = (left: ReactNode, right: ReactNode) => (
    <View style={[styles.pair, wide && styles.pairWide]}>
      <View style={wide ? styles.col : null}>{left}</View>
      <View style={wide ? styles.col : null}>{right}</View>
    </View>
  );
  const linear = funnel.steps.filter(step => !step.branch);
  const branches = funnel.steps.filter(step => step.branch);
  return (
    <View testID="analytics-report" style={styles.stack}>
      <View testID="analytics-kpis" style={styles.grid}>
        {kpis.map(tile => <Tile key={tile.key} tile={tile} cols={cols} qa={!operational} />)}
      </View>

      <SectionCard title="운영 퍼널" description={`${tag}상담 시작부터 결과 저장·QR까지 익명 세션 흐름이에요. 모든 단계가 세션 수예요(사람 수 아님).`}>
        <View testID="analytics-funnel" style={styles.list}>
          {linear.map((step, index) => <FunnelRow key={step.key} step={step} index={index + 1} />)}
          <View style={styles.branchHead}>
            <MaterialIcons name="subdirectory-arrow-right" size={16} color={colors.textMuted} />
            <Text style={styles.subhead}>결과 조회 이후 · 세션</Text>
          </View>
          <View style={styles.branchList}>
            {branches.map((step, index) => <FunnelRow key={step.key} step={step} index={linear.length + index + 1} />)}
          </View>
        </View>
      </SectionCard>

      {pair(
        <SectionCard title="판정 결과" description={`${tag}공급유형별 판정 결과 ${num(statusTotal)}건 기준이에요. 한 세션에서 공고·공급유형마다 결과가 하나씩 나와요.`}>
          <View testID="analytics-status" style={styles.list}>
            {statuses.map(row => (
              <DistRow key={row.key} row={row} unit="건" icon={STATUS_META[row.key as keyof typeof STATUS_META].icon} tone={STATUS_META[row.key as keyof typeof STATUS_META].tone}
                hint={STATUS_META[row.key as keyof typeof STATUS_META].hint} showShare />
            ))}
          </View>
        </SectionCard>,
        <SectionCard title="많이 막히는 조건" description={`${tag}답이 부족해 판정을 끝내지 못한 조건이에요. 같은 세션의 같은 조건은 한 번만 세요.`}>
          <View testID="analytics-unresolved" style={styles.list}>
            {blockers.length ? blockers.map((row, index) => (
              <DistRow key={row.key} row={row} unit="세션" rank={index + 1} tone="amber" />
            )) : <Text style={styles.caption}>이 기간에 막힌 조건 기록이 없어요.</Text>}
          </View>
        </SectionCard>,
      )}

      <SectionCard title="공급유형별 판정" description={`${tag}${noticeLabel(filters.notice, notices)} · 공급유형마다 판정 결과를 나눠 봐요. 자격 판정 결과이며 당첨과는 관계없어요.`}>
        {supplies ? (
          <View testID="analytics-supply" style={styles.grid}>
            {supplies.map(row => (
              <View key={row.key} style={[styles.tileWrap, { width: `${100 / supplyCols}%` }]}>
                <View testID={`analytics-supply-${row.key}`} style={styles.supplyCard} accessible
                  accessibilityLabel={`${row.label} 판정 결과 ${num(row.total)}건. ${row.cells.map(cell => `${cell.label} ${num(cell.count)}건`).join(', ')}`}>
                  <View style={styles.rowHead}>
                    <View style={styles.flex}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      <Text style={styles.raw}>{row.raw}</Text>
                    </View>
                    <Text style={styles.rowValue}>{num(row.total)}<Text style={styles.unit}> 건</Text><Text style={styles.share}> · {pct(row.share)}</Text></Text>
                  </View>
                  <StackBar cells={row.cells} />
                  <View style={styles.cellList}>
                    {row.cells.map(cell => (
                      <View key={cell.key} style={styles.cell}>
                        <MaterialIcons name={STATUS_META[cell.status].icon} size={14} color={tint[STATUS_META[cell.status].tone].fg} />
                        <Text style={[styles.caption, styles.flex]}>{cell.label}</Text>
                        <Text style={styles.cellValue}>{num(cell.count)}건{row.total ? ` · ${pct(cell.share)}` : ''}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : <Text testID="analytics-supply-missing" style={styles.caption}>서버가 공급유형별 판정 분포를 보내지 않았어요.</Text>}
      </SectionCard>

      {pair(
        <SectionCard title="AI 상담 품질" description={`${tag}${ai.total ? `AI 상담 사용 ${num(ai.total)}회 · 대체 답변 ${pct(ai.fallbackRate)}` : 'AI 상담 기록이 없어요'}`}>
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
                <DeltaLine delta={ai.fallbackDelta} prefix="대체 답변" />
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
        <SectionCard title="결과 저장·QR 행동" description={`${tag}행동 횟수예요. 한 세션이 여러 번 할 수 있어 세션 수와 따로 셉니다.`}>
          <View testID="analytics-actions" style={styles.list}>
            {funnel.actions.map(action => (
              <View key={action.key} style={styles.actionRow} accessible accessibilityLabel={`${action.label} ${num(action.count)}회${action.sessions !== null ? `, ${num(action.sessions)}세션` : ''}`}>
                <View style={styles.flex}>
                  <Text style={styles.rowLabel}>{action.label}</Text>
                  <Text style={styles.caption}>{action.sessions === null ? '세션 수 미제공' : `${num(action.sessions)}세션에서 · 세션당 ${action.perSession === null ? '—' : action.perSession.toFixed(1)}회`}</Text>
                </View>
                <Text style={styles.afterValue}>{num(action.count)}<Text style={styles.unit}> 회</Text></Text>
              </View>
            ))}
          </View>
        </SectionCard>,
      )}

      <SectionCard title="지표 기준" description="숫자를 읽는 법이에요. 보고할 때 같이 적어 주세요.">
        <View testID="analytics-definitions" style={styles.list}>
          {[
            '세션은 기기에서 새로 만든 익명 ID예요. 같은 사람이 다시 시작하면 다른 세션이에요. 사람 수로 쓰지 마세요.',
            '완료율 = 판정을 시작한 세션 중 판정 결과를 받은 세션 비율이에요(공급유형 건수가 아니에요).',
            '퍼널은 모두 세션 수, 결과 저장·QR 행동은 횟수예요. 둘을 섞어 비율을 내지 않아요.',
            '판정 결과·공급유형은 공고 × 공급유형마다 한 건씩 세요. 세션 수보다 커요. 당첨과는 관계없어요.',
            '기간은 한국 시간(KST) 달력 날짜예요. 이전 기간 비교는 같은 길이의 바로 앞 기간이에요.',
            '운영 집계 상태와 공식 데이터 준비 여부는 서버가 판단해요. 이 화면은 그 값을 그대로 보여요.',
          ].map(line => (
            <View key={line} style={styles.bullet}><Text style={styles.caption}>·</Text><Text style={[styles.caption, styles.flex]}>{line}</Text></View>
          ))}
        </View>
      </SectionCard>
    </View>
  );
}

const storeUnavailableNote = (summary: AnalyticsSummary) => (summary.currentQuery?.dataState === 'STORE_UNAVAILABLE' ? ' · Production 저장소 미연결' : '');

const DELTA_ICON: Record<Delta['direction'], IconName> = { up: 'north-east', down: 'south-east', flat: 'east', none: 'remove' };

function DeltaLine({ delta, prefix }: { delta: Delta; prefix?: string }) {
  return (
    <View style={styles.inlineNote}>
      <MaterialIcons name={DELTA_ICON[delta.direction]} size={14} color={colors.textMuted} />
      <Text style={styles.caption}>{prefix ? `${prefix} · ` : ''}{delta.text}</Text>
    </View>
  );
}

function FunnelRow({ step, index }: { step: FunnelStep; index: number }) {
  const value = step.count === null ? '미제공' : num(step.count);
  const detail = step.count === null ? '서버가 이 세션 수를 보내지 않았어요'
    : step.branch ? `${step.base?.label ?? ''} 대비 ${pct(step.base?.rate ?? null)} · 전체 대비 ${pct(step.ofTotal)}`
      : index === 1 ? '기준 단계'
        : `전체 대비 ${pct(step.ofTotal)}${step.dropFromPrevious ? ` · 이전 단계에서 −${num(step.dropFromPrevious.count)}세션 (${pct(step.dropFromPrevious.rate)} 이탈)` : ''}`;
  return (
    <View testID={`analytics-funnel-${step.key}`} style={styles.funnelStep} accessible
      accessibilityLabel={`${index}단계 ${step.label} ${value}${step.count === null ? '' : '세션'}. ${detail}.${step.delta.direction !== 'none' ? ` ${step.delta.text}.` : ''}`}>
      <View style={styles.rowHead}>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{index}</Text></View>
        <Text style={styles.rowLabel}>{step.label} 세션</Text>
        <Text style={styles.rowValue}>{value}{step.count === null ? null : <Text style={styles.unit}> 세션</Text>}</Text>
      </View>
      <Bar share={step.ofTotal ?? 0} tone="purple" />
      <Text style={styles.caption}>{detail}</Text>
      <DeltaLine delta={step.delta} />
      {step.anomaly ? (
        <View style={styles.inlineNote}>
          <MaterialIcons name="info-outline" size={14} color={colors.textMuted} />
          <Text style={styles.caption}>이전 단계보다 많아요. 앞 단계 기록이 빠진 세션이 있을 수 있어요(이탈로 계산하지 않아요).</Text>
        </View>
      ) : null}
    </View>
  );
}

function Tile({ tile, cols, qa }: { tile: KpiTile; cols: number; qa: boolean }) {
  return (
    <View style={[styles.tileWrap, { width: `${100 / cols}%` }]}>
      <View testID={`analytics-kpi-${tile.key}`} style={styles.tile} accessible
        accessibilityLabel={`${qa ? 'QA 기록. ' : ''}${tile.label} ${tile.value}${tile.unit}. ${tile.basis}.${tile.delta.direction !== 'none' ? ` ${tile.delta.text}.` : ''}`}>
        <View style={styles.tileTop}>
          <Text style={styles.tileLabel}>{tile.label}</Text>
          <MaterialIcons name={tile.icon as IconName} size={18} color={colors.primary} />
        </View>
        {qa ? (
          <View testID="analytics-qa-tag" style={styles.qaTag}>
            <MaterialIcons name="science" size={12} color={tint.amber.fg} />
            <Text style={styles.qaTagText}>QA 기록</Text>
          </View>
        ) : null}
        <Text style={styles.tileValue}>{tile.value}{tile.unit ? <Text style={styles.unit}> {tile.unit}</Text> : null}</Text>
        <Text style={styles.caption}>{tile.basis}</Text>
        <DeltaLine delta={tile.delta} />
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

/** 공급유형 안 상태 비율 막대(장식). 값은 아래 아이콘 + 글자 목록이 전한다. */
function StackBar({ cells }: { cells: Array<ShareRow & { status: keyof typeof STATUS_META }> }) {
  return (
    <View style={[styles.track, styles.stack0]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {cells.filter(cell => cell.share > 0).map(cell => (
        <View key={cell.key} style={{ width: `${cell.share * 100}%`, height: size.bar, backgroundColor: tint[STATUS_META[cell.status].tone].fg }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 12 },
  caption: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  staleText: { color: tint.amber.fg, fontFamily: type.label.fontFamily },
  demoNote: { ...type.caption, color: tint.amber.fg },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: spacing.md, borderRadius: radius.cardSm, flexWrap: 'wrap' },
  bannerCopy: { flex: 1, minWidth: 220, gap: 4 },
  bannerTitle: { ...type.bodySmStrong, flexShrink: 1 },
  bannerBody: { ...type.bodySm, flexShrink: 1 },
  checks: { gap: 6, alignSelf: 'stretch' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, flexShrink: 1 },
  checkText: { ...type.caption, color: colors.text, flexShrink: 1 },
  checkState: { fontFamily: type.label.fontFamily },
  hero: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  heroIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: tint.purple.bg, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { ...type.cardTitle, color: colors.text, flexShrink: 1 },
  heroBody: { ...type.body, color: colors.textMuted },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  scope: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.md },
  scopeHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  scopeCopy: { flex: 1, minWidth: 220, gap: 2 },
  scopeLabel: { ...type.caption, color: colors.textMuted },
  scopeValue: { ...type.bodySmStrong, color: colors.text },
  scopeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  freshList: { gap: 2, marginTop: 2 },
  stampRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  filters: { gap: spacing.sm },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  dateField: { gap: 2, flexGrow: 1, flexBasis: 140, maxWidth: 220 },
  dateInput: { ...type.body, color: colors.text, minHeight: size.touch, paddingHorizontal: 12, borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, rowGap: spacing.sm },
  tileWrap: { paddingHorizontal: spacing.xs },
  tile: { backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: 4, flexGrow: 1, minHeight: 148 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  tileLabel: { ...type.bodySmStrong, color: colors.text, flexShrink: 1 },
  tileValue: { ...type.display, color: colors.text },
  qaTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: tint.amber.bg },
  qaTagText: { ...type.micro, color: tint.amber.fg },
  unit: { ...type.bodySm, color: colors.textMuted },
  share: { ...type.bodySm, color: colors.textMuted },
  inlineNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  funnelStep: { gap: 4 },
  branchHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  branchList: { gap: 12, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.surfaceHigh },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowLabel: { ...type.bodySmStrong, color: colors.text, flexShrink: 1 },
  rowValue: { ...type.bodyStrong, color: colors.text, marginLeft: 'auto' },
  raw: { ...type.micro, color: colors.textSubtle, flexShrink: 1 },
  rank: { ...type.bodySmStrong, color: colors.textMuted, minWidth: 20 },
  stepBadge: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: tint.purple.bg, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { ...type.caption, color: tint.purple.fg, fontFamily: type.label.fontFamily },
  track: { height: size.bar, borderRadius: 4, backgroundColor: colors.surfaceContainer, overflow: 'hidden' },
  stack0: { flexDirection: 'row' },
  fill: { height: size.bar, borderRadius: 4 },
  subhead: { ...type.label, color: colors.text, marginTop: 4 },
  afterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  afterItem: { flexGrow: 1, flexBasis: 140, gap: 2, padding: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceLow },
  afterValue: { ...type.section, color: colors.text },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceLow },
  pair: { gap: spacing.md },
  pairWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  dist: { gap: 6 },
  distIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  supplyCard: { borderRadius: radius.button, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.sm, gap: 8, flexGrow: 1 },
  cellList: { gap: 4 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellValue: { ...type.caption, color: colors.text, fontFamily: type.label.fontFamily },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', padding: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceLow },
  warningCopy: { flex: 1, minWidth: 180, gap: 2 },
  bullet: { flexDirection: 'row', gap: 6 },
});
