import { StyleSheet, Text, View } from 'react-native';
import { hasSpouse } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { HouseholdYesNo, useChoiceValue } from '../../features/eventKiosk/ui/bindings';
import { ChoiceGroup, DateInput, Question, Section, Stepper } from '../../features/eventKiosk/ui/controls';
import { StepScreen } from '../../features/eventKiosk/ui/StepScreen';
import { k } from '../../features/eventKiosk/ui/theme';

/** 배우자·자녀. 가구 형태에 따라 필요한 질문만 나온다. */
export default function FamilyStep() {
  const type = useKioskStore(state => state.answers.householdType);
  const household = useKioskStore(state => state.answers.household);
  const patch = useKioskStore(state => state.patchHousehold);
  const registered = useChoiceValue('household.marriageRegistered', household.marriageRegistered);
  const spouse = hasSpouse(type);
  const children = type === 'withChildren' || type === 'singleParent';

  return (
    <StepScreen
      step="family"
      title={spouse ? '배우자와 자녀 정보예요' : '자녀 정보예요'}
      subtitle={spouse ? '배우자가 있으면 신혼부부·생애최초 공급을 함께 확인해요.' : '자녀 나이에 따라 신청할 수 있는 공급이 달라져요.'}
    >
      {spouse ? (
        <Section title="배우자">
          <Question title="혼인신고를 하셨나요?">
            <ChoiceGroup<boolean | null>
              testID="q-household-marriageRegistered"
              choices={[
                { value: true, label: '했어요' },
                { value: false, label: '아직이에요', hint: '예비신혼부부' },
                { value: null, label: '잘 모르겠어요' },
              ]}
              value={registered}
              onChange={marriageRegistered => {
                useKioskStore.getState().markAnswered('household.marriageRegistered');
                patch({ marriageRegistered, ...(marriageRegistered === false ? { marriageDate: '' } : { plannedMarriageWithinDeadline: null }) });
              }}
            />
          </Question>
          {household.marriageRegistered === true ? (
            <Question title="혼인신고일" hint="혼인 기간에 따라 신혼부부 공급 대상과 배점이 달라져요.">
              <DateInput testID="input-marriageDate" accessibilityLabel="혼인신고일" value={household.marriageDate} onChange={marriageDate => patch({ marriageDate })} placeholder="예) 20250914" />
            </Question>
          ) : null}
          {household.marriageRegistered === false ? (
            <Question title="입주 전까지 혼인 사실을 증명할 수 있나요?" hint="예비신혼부부는 공고에서 정한 기한까지 혼인신고를 마쳐야 해요.">
              <HouseholdYesNo field="plannedMarriageWithinDeadline" yes="할 수 있어요" no="어려워요" />
            </Question>
          ) : null}
        </Section>
      ) : null}

      {type === 'singleParent' ? (
        <Section title="한부모 가구">
          <Question title="한부모가족 증명서를 받을 수 있나요?">
            <HouseholdYesNo field="singleParentQualified" yes="받을 수 있어요" no="아니요" />
          </Question>
        </Section>
      ) : null}

      {children ? (
        <Section title="자녀">
          <Question title="함께 사는 미성년 자녀는 몇 명인가요?" hint="태아는 빼고 세어 주세요.">
            <Stepper testID="q-household-childrenCount" accessibilityLabel="자녀 수" value={household.childrenCount} onChange={childrenCount => patch({ childrenCount })} max={6} unit="명" />
          </Question>
          {household.childBirthDates.length ? (
            <Question title="자녀 생년월일" hint="공고일 기준 자녀 나이와 출산일 경계를 정확히 확인해요.">
              <View style={styles.children}>
                {household.childBirthDates.map((birthDate, index) => (
                  <View key={index} style={styles.child}>
                    <Text style={styles.childLabel}>{index + 1}번째 자녀</Text>
                    <DateInput
                      testID={`input-childBirthDate-${index}`}
                      accessibilityLabel={`${index + 1}번째 자녀 생년월일`}
                      value={birthDate}
                      placeholder="예) 20210315"
                      onChange={next => {
                        const current = useKioskStore.getState().answers.household;
                        const dates = [...current.childBirthDates];
                        const years = [...current.childBirthYears];
                        dates[index] = next;
                        years[index] = /^\d{4}/.test(next) ? Number(next.slice(0, 4)) : null;
                        patch({ childBirthDates: dates, childBirthYears: years });
                      }}
                    />
                  </View>
                ))}
              </View>
            </Question>
          ) : null}
        </Section>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  children: { gap: 16 },
  child: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  childLabel: { ...k.type.bodyLgStrong, color: k.colors.textMuted, minWidth: 120 },
});
