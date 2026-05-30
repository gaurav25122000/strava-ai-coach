import React from 'react';
import { Text, StyleSheet, TextProps } from 'react-native';
import { theme } from '../theme';

type Variant =
  | 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label'
  | 'display' | 'title' | 'subtitle' | 'numeric';

interface TypographyProps extends TextProps {
  variant?: Variant;
  color?: string;
  weight?: 'normal' | 'bold' | '600' | '700' | '800';
  children?: React.ReactNode;
  style?: any;
}

export const Typography = ({
  variant = 'body',
  color = theme.colors.text,
  weight,
  children,
  style,
  ...props
}: TypographyProps) => {
  return (
    <Text
      style={[
        styles[variant],
        { color },
        weight ? { fontWeight: weight } : null,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  // Legacy heading aliases now resolve to the Sora-backed display tokens so
  // they pick up the family, tracking, and line-height instead of plain bold.
  h1: theme.typography.display,
  h2: theme.typography.title,
  h3: theme.typography.subtitle,
  body: { fontSize: 16 },
  caption: { fontSize: 14, color: theme.colors.textSecondary },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: theme.colors.textSecondary,
  },
  display: theme.typography.display,
  title: theme.typography.title,
  subtitle: theme.typography.subtitle,
  numeric: theme.typography.numeric,
});
