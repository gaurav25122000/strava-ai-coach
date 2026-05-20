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
  h1: { fontSize: 48, fontWeight: 'bold' },
  h2: { fontSize: 24, fontWeight: 'bold' },
  h3: { fontSize: 18, fontWeight: '600' },
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
