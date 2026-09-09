import assert from 'node:assert/strict';
import type { Listing } from '../discovery/types.ts';
import { buildCalendarEvents, buildMonthGrid, filterCalendarEvents, groupCalendarEvents } from './calendarModel.ts';
import { getDdayLabel, getKoreanToday, moveMonth, parseDateOnly } from './domain.ts';

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: 'listing-1', sourceType: 'applyhome-apt', complexName: '테스트 단지', region: '서울', district: '송파구',
  address: '서울 송파구', latitude: null, longitude: null, announcementDate: '2026-09-01',
  recruitmentStatus: 'upcoming', recruitmentStartDate: '2026-09-14', recruitmentEndDate: '2026-09-16',
  winnerAnnouncementDate: '2026-09-25', contractStartDate: '2026-10-01', contractEndDate: '2026-10-03',
  announcementUrl: null, homepageUrl: null, housingType: '아파트', supplyType: '민간분양',
  representativePrice: null, householdCount: null,
  imagePlaceholder: { from: '#6558C8', to: '#393091', icon: 'apartment' }, interestTags: [], checkpoints: [], isDemo: false,
  ...overrides,
});

assert.deepEqual(parseDateOnly('2028-02-29'), { year: 2028, month: 2, day: 29 }, '윤년 2월 29일');
assert.equal(parseDateOnly('2027-02-29'), null, '평년 2월 29일 거부');
assert.equal(parseDateOnly('2026-9-09'), null, 'date-only 형식 고정');
assert.equal(getKoreanToday(new Date('2026-09-08T15:10:00.000Z')), '2026-09-09', 'KST 자정 직후 오늘');
assert.equal(getKoreanToday(new Date('2026-09-08T14:59:59.000Z')), '2026-09-08', 'KST 자정 직전 오늘');
assert.equal(getDdayLabel('2026-09-12', '2026-09-09'), 'D-3');
assert.equal(getDdayLabel('2026-09-09', '2026-09-09'), '오늘');
assert.equal(getDdayLabel('2026-09-08', '2026-09-09'), 'D+1');
assert.equal(moveMonth('2026-12', 1), '2027-01');
assert.equal(moveMonth('2026-01', -1), '2025-12');

const september = buildMonthGrid('2026-09', new Set(['2026-09-14']), '2026-09-09');
assert.equal(september.length, 42, '6주 month grid');
assert.equal(september[0]?.date, '2026-08-30', '이전 달 filler');
assert.equal(september.find((day) => day.inCurrentMonth)?.date, '2026-09-01', '월 첫 날짜');
assert.equal([...september].reverse().find((day) => day.inCurrentMonth)?.date, '2026-09-30', '월 마지막 날짜');
assert.equal(september.at(-1)?.date, '2026-10-10', '다음 달 filler');
assert.equal(september.find((day) => day.date === '2026-09-09')?.isToday, true, '오늘 표시');
assert.equal(september.find((day) => day.date === '2026-09-14')?.hasEvents, true, '일정 indicator');
const february = buildMonthGrid('2028-02', new Set(), '2028-02-01');
assert.equal(february.filter((day) => day.inCurrentMonth).length, 29, '윤년 월 길이');

const detailed = listing({
  officialSchedule: {
    specialSupply: { startDate: '2026-09-14', endDate: '2026-09-14' },
    priorityApplications: [{ rank: 1, scope: 'same-area', startDate: '2026-09-15', endDate: '2026-09-15' }],
  },
});
const events = buildCalendarEvents([detailed, listing({ id: 'listing-2', complexName: '두 번째 단지', announcementDate: null })]);
assert.equal(events.filter((event) => event.date === '2026-09-14').length, 2, '동일 날짜 복수 일정 grouping 전 보존');
assert.equal(groupCalendarEvents(events).get('2026-09-14')?.length, 2, '동일 날짜 복수 일정 grouping');
assert.equal(events.some((event) => event.type === 'special-supply' && event.label === '특별공급 접수'), true, '특별공급 일정');
assert.equal(events.some((event) => event.type === 'first-priority' && event.label.includes('해당지역')), true, '순위/지역 일정');
assert.equal(events.some((event) => event.type === 'application' && event.listingId === detailed.id), false, '세부 일정이 있으면 generic 접수 중복 금지');
assert.equal(events.some((event) => event.type === 'application' && event.listingId === 'listing-2'), true, '세부 일정 없는 공고는 generic 접수');
assert.equal(filterCalendarEvents(events, 'saved', ['listing-2']).every((event) => event.listingId === 'listing-2'), true, '관심 공고 필터');

const partial = buildCalendarEvents([listing({
  officialSchedule: { specialSupply: { startDate: 'bad', endDate: '2026-09-20' }, priorityApplications: [] },
})]);
assert.equal(partial.some((event) => event.date === '2026-09-20' && event.label.endsWith('마감')), true, 'partial 일정의 유효한 날짜만 사용');

console.log('calendar tests passed');
