import { StyleSheet, Text } from 'react-native';
import { colors, spacing, type } from '../design/tokens';
import { DISCLAIMER } from '../domain/preparation';

export function Disclaimer() {
  return <Text style={styles.text}>{DISCLAIMER}</Text>;
}

const styles = StyleSheet.create({
  text: { ...type.caption, color: colors.textMuted, paddingVertical: spacing.sm },
});
