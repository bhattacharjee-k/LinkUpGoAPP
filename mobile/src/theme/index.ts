import { MD3DarkTheme } from 'react-native-paper';
import { colors } from './colors';

export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceElevated,
    error: colors.error,
    onPrimary: colors.primaryForeground,
    onBackground: colors.text,
    onSurface: colors.text,
    outline: colors.border,
  },
};

export { colors };
