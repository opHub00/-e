import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { Pop } from '../../components/motion/Pop';
import { HOUSEHOLD_TYPES, type HouseholdType } from '../../features/eventKiosk/model';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { StepScreen } from '../../features/eventKiosk/ui/StepScreen';
import { k } from '../../features/eventKiosk/ui/theme';

const ICONS: Record<HouseholdType, React.ComponentProps<typeof MaterialIcons>['name']> = {
  single: 'person',
  couple: 'people',
  withChildren: 'family-restroom',
  singleParent: 'escalator-warning',
  other: 'more-horiz',
};

/** 청약 유형 대신 가구 형태부터 묻는다. 어떤 공급에 해당하는지는 엔진이 정한다. */
export default function HouseholdStep() {
  const value = useKioskStore(state => state.answers.householdType);
  const setHouseholdType = useKioskStore(state => state.setHouseholdType);
  return (
    <StepScreen step="household" title="누구와 함께 청약을 준비하세요?" subtitle="가구 형태에 맞는 질문만 이어서 물어볼게요.">
      <View style={styles.grid} accessibilityRole="radiogroup">
        {HOUSEHOLD_TYPES.map(type => {
          const selected = value === type.key;
          return (
            <MotionPressable
              key={type.key}
              testID={`household-${type.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              aria-checked={selected}
              accessibilityLabel={`${type.label}. ${type.hint}`}
              onPress={() => setHouseholdType(type.key)}
              style={[styles.card, selected && styles.cardSelected]}
            >
              <View style={[styles.icon, selected && styles.iconSelected]}>
                <MaterialIcons name={ICONS[type.key]} size={36} color={selected ? k.colors.onPrimary : k.colors.primary} />
              </View>
              <View style={styles.text}>
                <Text style={[styles.label, selected && styles.labelSelected]}>{type.label}</Text>
                <Text style={styles.hint}>{type.hint}</Text>
              </View>
              <Pop active={selected}>
                <MaterialIcons name={selected ? 'check-circle' : 'radio-button-unchecked'} size={32} color={selected ? k.colors.primary : k.colors.outline} />
              </Pop>
            </MotionPressable>
          );
        })}
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    flexGrow: 1,
    flexBasis: 380,
    minHeight: 112,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: k.colors.surfaceHighest,
    backgroundColor: k.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  cardSelected: { borderColor: k.colors.primary, borderWidth: 2, backgroundColor: k.colors.lavender },
  icon: { width: 64, height: 64, borderRadius: 16, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: k.colors.primary },
  text: { flex: 1, gap: 4 },
  label: { ...k.type.section, color: k.colors.text },
  labelSelected: { color: k.colors.primary },
  hint: { ...k.type.body, color: k.colors.textMuted },
});
