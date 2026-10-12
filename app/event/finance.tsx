import { hasSpouse, type ParentInformationStatus } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { HouseholdYesNo, TrackedNumberInput, TrackedStepper, useChoiceValue } from '../../features/eventKiosk/ui/bindings';
import { ChoiceGroup, Question, Section, UnknownAcknowledgement } from '../../features/eventKiosk/ui/controls';
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
  { value: null, label: '정확한 기간을 몰라요' },
] as const;

export default function FinanceStep() {
  const type = useKioskStore(state => state.answers.householdType);
  const applicant = useKioskStore(state => state.answers.applicant);
  const household = useKioskStore(state => state.answers.household);
  const patchApplicant = useKioskStore(state => state.patchApplicant);
  const patchHousehold = useKioskStore(state => state.patchHousehold);
  const patchAdaptive = useKioskStore(state => state.patchAdaptive);
  const tax = useChoiceValue('applicant.taxPaymentYears', applicant.taxPaymentYears);
  const vehicleValue = useKioskStore(state => state.answers.adaptive.vehicleValueKrw);
  const parentStatusValue = household.parentInformationStatus ?? (household.parentAssets !== null ? 'KNOWN' : null);
  const parentStatus = useChoiceValue('household.parentInformationStatus', parentStatusValue) ?? undefined;
  const spouse = hasSpouse(type);
  const single = type === 'single';
  // 청년 공급은 혼인하지 않은 사람만 본다. 그 공급에서만 부모 자산을 따진다.
  const unmarried = !spouse || household.marriageRegistered === false;

  return (
    <StepScreen step="finance" title="소득과 자산을 알려 주세요" subtitle="대략적인 금액이면 충분해요. 모르면 ‘정확히 몰라요’를 선택해 주세요.">
      <Section title="소득">
        <Question title="본인의 월 소득(세전)" hint="지난해 기준 한 달 평균이에요. 만원 단위로 입력해 주세요.">
          <TrackedNumberInput questionKey="applicant.monthlyIncome" testID="input-monthlyIncome" accessibilityLabel="본인 월 소득(만원)" value={applicant.monthlyIncome} unitScale={MAN} unit="만원" placeholder="예) 270" onChange={monthlyIncome => patchApplicant({ monthlyIncome })} />
        </Question>
        <Question title="일해서 소득세를 낸 기간" hint="근로·사업소득으로 소득세를 낸 햇수예요.">
          <ChoiceGroup<number | null>
            testID="q-applicant-taxPaymentYears"
            columns={4}
            choices={TAX_CHOICES.map(choice => ({ ...choice }))}
            value={tax}
            onChange={taxPaymentYears => {
              const store = useKioskStore.getState();
              if (taxPaymentYears === null) store.markDoesNotKnow('applicant.taxPaymentYears');
              else store.markAnswered('applicant.taxPaymentYears');
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
            <TrackedStepper questionKey="household.householdSize" testID="q-household-householdSize" accessibilityLabel="세대원 수" value={household.householdSize} onChange={householdSize => patchHousehold({ householdSize })} min={1} max={10} unit="명" />
          </Question>
        )}
        {single ? null : (
          <Question title="세대 전체 월 소득(세전)" hint="세대원 모두의 소득을 더한 금액이에요.">
            <TrackedNumberInput questionKey="household.householdIncome" testID="input-householdIncome" accessibilityLabel="세대 월 소득(만원)" value={household.householdIncome} unitScale={MAN} unit="만원" placeholder="예) 500" onChange={householdIncome => patchHousehold({ householdIncome })} />
          </Question>
        )}
        <Question title={single ? '본인 총자산' : '세대 총자산'} hint="부동산·자동차·예금 등을 더한 금액에서 부채를 뺀 금액이에요.">
          <TrackedNumberInput questionKey="household.totalAssets" testID="input-totalAssets" accessibilityLabel="총자산(만원)" value={household.totalAssets} unitScale={MAN} unit="만원" placeholder="예) 10000" onChange={totalAssets => patchHousehold({ totalAssets })} />
        </Question>
        <Question title="세대 보유 차량 중 가장 높은 차량가액" hint="차량이 없으면 0을 입력해 주세요. 대부분의 자산 기준에서 공통으로 확인하는 항목이에요.">
          <TrackedNumberInput questionKey="adaptive.vehicleValueKrw" testID="input-vehicleValueKrw" accessibilityLabel="차량가액(만원)" value={vehicleValue} unitScale={MAN} unit="만원" placeholder="예) 1500" onChange={vehicleValueKrw => patchAdaptive({ vehicleValueKrw })} />
        </Question>
        {unmarried ? (
          <Question title="부모님 자산 정보를 확인할 수 있나요?" hint="청년 공급에서만 확인해요. 부모님이 없거나 연락이 어려운 경우에도 금액을 0으로 추정하지 않습니다.">
            <ChoiceGroup<ParentInformationStatus>
              testID="q-household-parentInformationStatus"
              columns={2}
              choices={[
                { value: 'KNOWN', label: '금액을 알고 있어요' },
                { value: 'NO_PARENTS', label: '부모님이 안 계세요' },
                { value: 'CANNOT_CONTACT', label: '연락·확인이 어려워요' },
                { value: 'DOES_NOT_KNOW', label: '정확히 몰라요' },
              ]}
              value={parentStatus}
              onChange={parentInformationStatus => {
                const store = useKioskStore.getState();
                if (parentInformationStatus === 'DOES_NOT_KNOW') store.markDoesNotKnow('household.parentInformationStatus');
                else store.markAnswered('household.parentInformationStatus');
                patchHousehold({ parentInformationStatus, ...(parentInformationStatus === 'KNOWN' ? {} : { parentAssets: null }) });
              }}
            />
            <UnknownAcknowledgement
              visible={parentStatusValue === 'DOES_NOT_KNOW' || parentStatusValue === 'NO_PARENTS' || parentStatusValue === 'CANNOT_CONTACT'}
              message="괜찮아요. 부모 자산은 결과에서 확인이 필요한 항목으로 표시할게요."
            />
          </Question>
        ) : null}
        {unmarried && parentStatusValue === 'KNOWN' ? (
          <Question title="부모님 총자산" hint="확인한 금액을 입력해 주세요. 정확하지 않으면 ‘잘 모르겠어요’를 선택할 수 있어요.">
            <TrackedNumberInput questionKey="household.parentAssets" testID="input-parentAssets" accessibilityLabel="부모님 총자산(만원)" value={household.parentAssets} unitScale={MAN} unit="만원" placeholder="예) 20000" onChange={parentAssets => patchHousehold({ parentAssets })} />
          </Question>
        ) : null}
      </Section>
    </StepScreen>
  );
}
