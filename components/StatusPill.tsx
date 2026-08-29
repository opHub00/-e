import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tint, type } from '../design/tokens';

type Props = {
  label: string;
  tone?: keyof typeof tint;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  inverted?: boolean;
};

export function StatusPill({ label, tone = 'purple', icon, inverted }: Props) {
  const palette = tint[tone];
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: inverted ? 'rgba(255,255,255,0.16)' : palette.bg },
      ]}
    >
      {icon ? (
        <MaterialIcons name={icon} size={14} color={inverted ? colors.onPrimary : palette.fg} />
      ) : null}
      <Text style={[styles.label, { color: inverted ? colors.onPrimary : palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  label: { ...type.label },
});
