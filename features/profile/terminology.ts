export type ProfileTermId =
  | 'subscription-period'
  | 'home-ownership'
  | 'household-home-ownership'
  | 'previous-home-ownership'
  | 'special-supply-restriction'
  | 'household-member'
  | 'work-business-income'
  | 'income-tax-period'
  | 'asset-range';

export type ProfileTermHelp = {
  id: ProfileTermId;
  title: string;
  description: string;
};

export const PROFILE_TERM_HELP: Record<ProfileTermId, ProfileTermHelp> = {
  'subscription-period': {
    id: 'subscription-period',
    title: '청약통장 가입기간이란?',
    description: '청약통장을 처음 만든 날부터 현재까지 지난 기간이에요. 정확한 날짜를 모르겠다면 청약홈이나 가입 은행에서 확인할 수 있어요.',
  },
  'home-ownership': {
    id: 'home-ownership',
    title: '본인 명의 주택이란?',
    description: '현재 본인이 소유자로 등록된 주택이 있는지를 묻는 항목이에요. 지분·분양권 등 세부 인정 범위는 모집공고와 공식 기관에서 확인해야 해요.',
  },
  'household-home-ownership': {
    id: 'household-home-ownership',
    title: '무주택 세대구성원이란?',
    description: '본인뿐 아니라 공고에서 정한 세대구성원도 주택을 소유하지 않은 상태를 뜻해요. 세대 범위는 공고마다 확인이 필요하니 모르겠다면 그대로 표시해도 돼요.',
  },
  'previous-home-ownership': {
    id: 'previous-home-ownership',
    title: '과거 주택 보유 이력이란?',
    description: '현재는 주택이 없어도 예전에 주택을 소유했던 적이 있는지 묻는 항목이에요. 분양권·지분 등의 포함 여부는 공식 기록과 공고문에서 확인해 주세요.',
  },
  'special-supply-restriction': {
    id: 'special-supply-restriction',
    title: '특별공급 제한이란?',
    description: '과거 특별공급 당첨 등으로 다른 특별공급 신청이 제한되는 이력이 있는지 확인하는 항목이에요. 정확히 모르겠다면 청약홈에서 확인하거나 잘 모르겠어요를 선택해도 돼요.',
  },
  'household-member': {
    id: 'household-member',
    title: '세대원이란?',
    description: '주민등록표와 가족관계 등을 기준으로 함께 확인되는 구성원을 뜻해요. 공급 유형별 인정 범위가 다를 수 있어 최종적으로는 공고문을 확인해야 해요.',
  },
  'work-business-income': {
    id: 'work-business-income',
    title: '근로·사업소득이란?',
    description: '직장 급여나 사업·자영업 활동에서 생긴 소득을 말해요. 여기서는 현재 또는 최근 1년의 해당 여부만 확인해요.',
  },
  'income-tax-period': {
    id: 'income-tax-period',
    title: '소득세 납부기간이란?',
    description: '근로·사업소득에 대해 소득세를 낸 기간을 합산한 값이에요. 정확한 기간은 소득금액증명 등 공식 자료로 확인해 주세요.',
  },
  'asset-range': {
    id: 'asset-range',
    title: '자산 범위는 왜 묻나요?',
    description: '일부 공급은 금융자산·부동산·차량·부채 기준을 함께 확인해요. 완판e는 정확한 금액 대신 범위만 받고, 최종 기준은 공고문에서 확인하도록 안내해요.',
  },
};

export function getProfileTermHelp(id: ProfileTermId): ProfileTermHelp {
  return PROFILE_TERM_HELP[id];
}
