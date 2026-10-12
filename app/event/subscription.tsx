import type { AccountKind } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { ApplicantYesNo, SubscriptionYesNo, TrackedDateInput, TrackedNumberInput, useChoiceValue } from '../../features/eventKiosk/ui/bindings';
import { ChoiceGroup, Question, Section } from '../../features/eventKiosk/ui/controls';
import { StepScreen } from '../../features/eventKiosk/ui/StepScreen';

const MAN = 10_000;

export default function SubscriptionStep() {
  const subscription = useKioskStore(state => state.answers.subscription);
  const patch = useKioskStore(state => state.patchSubscription);
  const kind = useChoiceValue('subscription.accountKind', subscription.accountKind);
  const hasAccount = subscription.accountKind === 'housing' || subscription.accountKind === 'other';

  return (
    <StepScreen step="subscription" title="집과 청약통장 상황이에요" subtitle="마지막 단계예요.">
      <Section title="집과 당첨 이력">
        <Question title="본인과 세대원 모두 지금 집이 없나요?" hint="분양권·입주권도 집으로 봐요.">
          <ApplicantYesNo field="householdNoHome" yes="모두 없어요" no="있어요" />
        </Question>
        <Question title="본인과 세대원 모두 지금까지 집을 가져 본 적이 없나요?" hint="생애최초 공급은 한 번도 가진 적이 없어야 해요.">
          <ApplicantYesNo field="neverOwnedHome" yes="가진 적 없어요" no="가진 적 있어요" />
        </Question>
        <Question title="본인이나 세대원이 특별공급에 당첨된 적이 있나요?" hint="일반 청약 당첨과 구분해 주세요. 정확하지 않으면 확인 필요로 남길 수 있어요.">
          <ApplicantYesNo field="specialSupplyHistory" yes="있어요" no="없어요" />
        </Question>
        <Question title="현재 재당첨 또는 부적격 당첨 제한기간인가요?" hint="청약홈의 청약제한사항 조회 결과를 기준으로 답해 주세요.">
          <ApplicantYesNo field="reWinningRestriction" yes="해당해요" no="아니에요" />
        </Question>
        <Question title="세대원 모두 최근 5년 안에 다른 주택에 당첨된 적이 없나요?" hint="생애최초·일반공급의 1순위 조건을 확인해요.">
          <ApplicantYesNo field="householdNoWinningFiveYears" yes="모두 없어요" no="당첨 이력이 있어요" />
        </Question>
      </Section>

      <Section title="청약통장">
        <Question title="어떤 청약통장을 갖고 계세요?">
          <ChoiceGroup<AccountKind | null>
            testID="q-subscription-accountKind"
            columns={2}
            choices={[
              { value: 'housing', label: '주택청약종합저축' },
              { value: 'other', label: '다른 청약통장', hint: '청약저축·청약예금·청약부금' },
              { value: 'none', label: '없어요' },
              { value: null, label: '확인해 봐야 해요' },
            ]}
            value={kind}
            onChange={accountKind => {
              const store = useKioskStore.getState();
              if (accountKind === null) store.markDoesNotKnow('subscription.accountKind');
              else store.markAnswered('subscription.accountKind');
              patch({ accountKind });
            }}
          />
        </Question>
        {hasAccount ? (
          <>
            <Question title="통장 가입일" hint="대략적인 날짜여도 괜찮아요.">
              <TrackedDateInput questionKey="subscription.openedAt" testID="input-openedAt" accessibilityLabel="청약통장 가입일" value={subscription.openedAt} onChange={openedAt => patch({ openedAt })} placeholder="예) 20240101" />
            </Question>
            <Question title="인정된 납입 횟수" hint="청약홈이나 은행 앱의 ‘납입 인정 회차’예요.">
              <TrackedNumberInput questionKey="subscription.paymentCount" testID="input-paymentCount" accessibilityLabel="납입 횟수" value={subscription.paymentCount} unit="회" placeholder="예) 24" onChange={paymentCount => patch({ paymentCount })} />
            </Question>
            <Question title="인정된 납입 금액">
              <TrackedNumberInput questionKey="subscription.depositAmount" testID="input-depositAmount" accessibilityLabel="납입 금액(만원)" value={subscription.depositAmount} unitScale={MAN} unit="만원" placeholder="예) 600" onChange={depositAmount => patch({ depositAmount })} />
            </Question>
            <Question title="1순위 조건을 채웠나요?" hint="가입 기간과 납입 횟수가 공고 기준을 넘었는지예요. 은행 앱에서 확인할 수 있어요.">
              <SubscriptionYesNo field="firstRank" yes="채웠어요" no="아직이에요" />
            </Question>
          </>
        ) : null}
      </Section>
    </StepScreen>
  );
}
