import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { ChildExpectationStatus } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { ApplicantYesNo, useChoiceValue } from '../../features/eventKiosk/ui/bindings';
import { ChoiceGroup, DateInput, Question, Section, UnknownAcknowledgement } from '../../features/eventKiosk/ui/controls';
import { StepScreen } from '../../features/eventKiosk/ui/StepScreen';

/** 거주기간은 아래쪽 경계로 받는다. '2년 이상'은 24개월로 계산해, 실제보다 길게 잡지 않는다. */
const RESIDENCE_CHOICES = [
  { value: 0, label: '6개월 미만' },
  { value: 6, label: '6개월 이상' },
  { value: 12, label: '1년 이상' },
  { value: 24, label: '2년 이상' },
  { value: 60, label: '5년 이상' },
  { value: null, label: '정확한 기간을 몰라요' },
] as const;

export default function ApplicantStep() {
  const load = kioskEvent();
  const region = load.ok ? load.event.config.regionLabel : '';
  const applicant = useKioskStore(state => state.answers.applicant);
  const patch = useKioskStore(state => state.patchApplicant);
  const household = useKioskStore(state => state.answers.household);
  const patchHousehold = useKioskStore(state => state.patchHousehold);
  const residence = useChoiceValue('applicant.residenceMonths', applicant.residenceMonths);
  const childExpectation = useChoiceValue('household.childExpectationStatus', household.childExpectationStatus) ?? undefined;

  return (
    <StepScreen step="applicant" title="신청하실 분에 대해 알려 주세요" subtitle="청약을 신청할 본인 기준이에요.">
      <Section title="기본 정보">
        <Question title="생년월일" hint="숫자만 눌러도 돼요. 예) 19950914" testID="q-birthDate">
          <DateInput testID="input-birthDate" accessibilityLabel="생년월일" value={applicant.birthDate} onChange={birthDate => patch({ birthDate })} />
        </Question>
        <Question title="세대주인가요?" hint="주민등록등본에 세대주로 올라 있는지예요.">
          <ApplicantYesNo field="isHouseholdHead" />
        </Question>
      </Section>
      <Section title="거주">
        <Question title={`지금 ${region}에 살고 계세요?`} hint="주민등록상 주소 기준이에요.">
          <ApplicantYesNo field="livesInEventRegion" />
        </Question>
        {applicant.livesInEventRegion ? (
          <Question title={`${region}에서 계속 산 지 얼마나 됐나요?`}>
            <ChoiceGroup<number | null>
              testID="q-applicant-residenceMonths"
              choices={RESIDENCE_CHOICES.map(choice => ({ ...choice }))}
              value={residence}
              onChange={residenceMonths => {
                const store = useKioskStore.getState();
                if (residenceMonths === null) store.markDoesNotKnow('applicant.residenceMonths');
                else store.markAnswered('applicant.residenceMonths');
                patch({ residenceMonths });
              }}
            />
          </Question>
        ) : null}
        <Question title="최근 해외에 계속 90일 넘게 나가 있었던 적이 있나요?" hint="유학·근무·장기 여행 등. 거주기간 계산에 영향을 줘요.">
          <ApplicantYesNo field="longOverseasStay" yes="있어요" no="없어요" />
        </Question>
        <Question title="공고의 특례에 해당할 수 있는 사정이 있나요?" hint="예) 해외 근무 발령, 군 복무, 최근 출산 등. 없으면 ‘없어요’를 골라 주세요.">
          <ApplicantYesNo field="specialException" yes="있어요" no="없어요" />
        </Question>
      </Section>
      <Section title="자녀·출산 확인">
        <Question title="현재 태아 또는 입양 절차 중인 자녀가 있나요?" hint="출생한 자녀의 생년월일은 다음 단계에서 별도로 받아요. 태아·입양 여부를 모르면 그대로 확인 필요로 남깁니다.">
          <ChoiceGroup<ChildExpectationStatus>
            testID="q-household-childExpectationStatus"
            columns={2}
            choices={[
              { value: 'NONE', label: '없어요' },
              { value: 'UNBORN', label: '태아가 있어요' },
              { value: 'ADOPTION', label: '입양 절차 중이에요' },
              { value: 'BOTH', label: '둘 다 해당해요' },
              { value: 'DOES_NOT_KNOW', label: '확인해 봐야 해요' },
            ]}
            value={childExpectation}
            onChange={childExpectationStatus => {
              const store = useKioskStore.getState();
              if (childExpectationStatus === 'DOES_NOT_KNOW') store.markDoesNotKnow('household.childExpectationStatus');
              else store.markAnswered('household.childExpectationStatus');
              patchHousehold({ childExpectationStatus });
            }}
          />
          <UnknownAcknowledgement visible={childExpectation === 'DOES_NOT_KNOW'} />
        </Question>
      </Section>
    </StepScreen>
  );
}
