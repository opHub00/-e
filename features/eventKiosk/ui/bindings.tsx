import type { ApplicantInfo, HouseholdInfo, SubscriptionInfo } from '../model';
import { useKioskStore } from '../useKioskStore';
import { YesNoUnknown } from './controls';

type BoolKeys<T> = { [K in keyof T]: T[K] extends boolean | null ? K : never }[keyof T];

/** 예/아니요/모름 질문을 저장소에 바로 묶는다. 화면마다 같은 배선을 반복하지 않게. */
export function ApplicantYesNo({ field, yes, no }: { field: BoolKeys<ApplicantInfo>; yes?: string; no?: string }) {
  const value = useKioskStore(state => state.answers.applicant[field]) as boolean | null;
  const answered = useKioskStore(state => state.answered.includes(`applicant.${field}`));
  return (
    <YesNoUnknown
      testID={`q-applicant-${field}`}
      value={value}
      answered={answered}
      yes={yes}
      no={no}
      onChange={next => {
        const store = useKioskStore.getState();
        store.markAnswered(`applicant.${field}`);
        store.patchApplicant({ [field]: next } as Partial<ApplicantInfo>);
      }}
    />
  );
}

export function HouseholdYesNo({ field, yes, no }: { field: BoolKeys<HouseholdInfo>; yes?: string; no?: string }) {
  const value = useKioskStore(state => state.answers.household[field]) as boolean | null;
  const answered = useKioskStore(state => state.answered.includes(`household.${field}`));
  return (
    <YesNoUnknown
      testID={`q-household-${field}`}
      value={value}
      answered={answered}
      yes={yes}
      no={no}
      onChange={next => {
        const store = useKioskStore.getState();
        store.markAnswered(`household.${field}`);
        store.patchHousehold({ [field]: next } as Partial<HouseholdInfo>);
      }}
    />
  );
}

export function SubscriptionYesNo({ field, yes, no }: { field: BoolKeys<SubscriptionInfo>; yes?: string; no?: string }) {
  const value = useKioskStore(state => state.answers.subscription[field]) as boolean | null;
  const answered = useKioskStore(state => state.answered.includes(`subscription.${field}`));
  return (
    <YesNoUnknown
      testID={`q-subscription-${field}`}
      value={value}
      answered={answered}
      yes={yes}
      no={no}
      onChange={next => {
        const store = useKioskStore.getState();
        store.markAnswered(`subscription.${field}`);
        store.patchSubscription({ [field]: next } as Partial<SubscriptionInfo>);
      }}
    />
  );
}

/** 선택지 질문의 '골랐는지'. null 값('모름')과 아직 안 고른 것을 구별한다. */
export function useChoiceValue<T>(key: string, value: T): T | undefined {
  const answered = useKioskStore(state => state.answered.includes(key));
  return answered || value !== null ? value : undefined;
}
