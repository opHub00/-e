import { hasSpouse } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { HouseholdYesNo, useChoiceValue } from '../../features/eventKiosk/ui/bindings';
import { ChoiceGroup, NumberInput, Question, Section, Stepper } from '../../features/eventKiosk/ui/controls';
import { StepScreen } from '../../features/eventKiosk/ui/StepScreen';

const MAN = 10_000;

/** 소득세 납부 기간도 아래쪽 경계로 받는다. '5년 이상'은 5년이다. */
const TAX_CHOICES = [
  { value: 0, label: '없어요' },
  { value: 1, label: '1년' },
  { value: 2, label: '2년' },
  { value: 3, label: '3년' },
  { value: 4, label: '4년' },
  { value: 5, label: '5년 이상' },
  { value: null, label: '잘 모르겠어요' },
] as const;

export default function FinanceStep() {
  const type = useKioskStore(state => state.answers.householdType);
  const applicant = useKioskStore(state => state.answers.applicant);
  const household = useKioskStore(state => state.answers.household);
  const patchApplicant = useKioskStore(state => state.patchApplicant);
  const patchHousehold = useKioskStore(state => state.patchHousehold);
  const tax = useChoiceValue('applicant.taxPaymentYears', applicant.taxPaymentYears);
  const spouse = hasSpouse(type);
  const single = type === 'single';
  // 청년 공급은 혼인하지 않은 사람만 본다. 그 공급에서만 부모 자산을 따진다.
  const unmarried = !spouse || household.marriageRegistered === false;

  return (
    <StepScreen step="finance" title="소득과 자산을 알려 주세요" subtitle="대략적인 금액이면 충분해요. 모르면 비워 두세요.">
      <Section title="소득">
        <Question title="본인의 월 소득(세전)" hint="지난해 기준 한 달 평균이에요. 만원 단위로 입력해 주세요.">
          <NumberInput testID="input-monthlyIncome" accessibilityLabel="본인 월 소득(만원)" value={applicant.monthlyIncome} unitScale={MAN} unit="만원" placeholder="예) 270" onChange={monthlyIncome => patchApplicant({ monthlyIncome })} />
        </Question>
        <Question title="일해서 소득세를 낸 기간" hint="근로·사업소득으로 소득세를 낸 햇수예요.">
          <ChoiceGroup<number | null>
            testID="q-applicant-taxPaymentYears"
            columns={4}
            choices={TAX_CHOICES.map(choice => ({ ...choice }))}
            value={tax}
            onChange={taxPaymentYears => {
              useKioskStore.getState().markAnswered('applicant.taxPaymentYears');
              patchApplicant({ taxPaymentYears });
            }}
          />
        </Question>
        {spouse ? (
          <Question title="배우자도 소득이 있나요?" hint="맞벌이면 소득 기준이 조금 넓어져요.">
            <HouseholdYesNo field="dualIncome" yes="맞벌이예요" no="외벌이예요" />
          </Question>
        ) : null}
      </Section>

      <Section title="세대">
        {single ? null : (
          <Question title="세대원 수(본인 포함)" hint="주민등록등본에 함께 올라 있는 사람 수예요.">
            <Stepper testID="q-household-householdSize" accessibilityLabel="세대원 수" value={household.householdSize} onChange={householdSize => patchHousehold({ householdSize })} min={1} max={10} unit="명" />
          </Question>
        )}
        {single ? null : (
          <Question title="세대 전체 월 소득(세전)" hint="세대원 모두의 소득을 더한 금액이에요.">
            <NumberInput testID="input-householdIncome" accessibilityLabel="세대 월 소득(만원)" value={household.householdIncome} unitScale={MAN} unit="만원" placeholder="예) 500" onChange={householdIncome => patchHousehold({ householdIncome })} />
          </Question>
        )}
        <Question title={single ? '본인 총자산' : '세대 총자산'} hint="부동산·자동차·예금 등을 더한 금액에서 부채를 뺀 금액이에요.">
          <NumberInput testID="input-totalAssets" accessibilityLabel="총자산(만원)" value={household.totalAssets} unitScale={MAN} unit="만원" placeholder="예) 10000" onChange={totalAssets => patchHousehold({ totalAssets })} />
        </Question>
        {unmarried ? (
          <Question title="부모님 총자산" hint="청년 공급에서만 봐요. 모르면 비워 두세요.">
            <NumberInput testID="input-parentAssets" accessibilityLabel="부모님 총자산(만원)" value={household.parentAssets} unitScale={MAN} unit="만원" placeholder="예) 20000" onChange={parentAssets => patchHousehold({ parentAssets })} />
          </Question>
        ) : null}
      </Section>
    </StepScreen>
  );
}
