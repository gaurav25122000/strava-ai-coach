import React from 'react';
import { View, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Typography } from '../Typography';
import { familyStyle, WidgetFamily } from '../../utils/widgetFamilies';
import { styles } from './styles';

interface WidgetCardProps {
  /** Family drives accent border + header tint + icon colour. */
  family: WidgetFamily;
  /** Title shown in the header band. */
  title: string;
  /** Optional small caption next to the title (e.g. "last 7 days"). */
  caption?: string;
  /** Lucide icon shown in the header pill. */
  icon?: LucideIcon;
  /** Right-aligned interactive element in the header (chip, dropdown, etc.) */
  action?: React.ReactNode;
  /** Tap handler for the whole card (skip the action region). */
  onPress?: () => void;
  /** Card-level extras: 'hero' uses a gradient backdrop; 'elevated' bumps shadow. */
  variant?: 'flat' | 'hero' | 'elevated';
  /** Optional extra style to merge into the outer card. */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The single dashboard-card primitive. Every Overview widget is a thin wrapper
 * around this — pick a family, a title, an icon, drop a body in. The component
 * owns the accent stroke, header rhythm, padding, and shadow so the dashboard
 * stays visually coherent without each widget repeating itself.
 */
export function WidgetCard({
  family,
  title,
  caption,
  icon: Icon,
  action,
  onPress,
  variant = 'flat',
  style,
  children,
}: WidgetCardProps) {
  const fam = familyStyle(family);

  // Section style: edge-to-edge, no boxed border. Identity comes from the
  // small accent bar above the title + the family-coloured icon/caption.
  const cardStyle: StyleProp<ViewStyle> = [styles.card, style];

  const body = (
    <>
      <View style={[styles.accentBar, { backgroundColor: fam.accent }]} />
      <View style={styles.header}>
        {Icon && (
          <View style={[styles.iconPill, { backgroundColor: fam.accent + '22', borderColor: fam.accent + '55' }]}>
            <Icon size={15} color={fam.accent} />
          </View>
        )}
        <View style={styles.titleWrap}>
          <Typography style={styles.title} numberOfLines={1}>
            {title}
          </Typography>
          {caption && (
            <Typography style={[styles.caption, { color: fam.accent }]} numberOfLines={1}>
              {caption}
            </Typography>
          )}
        </View>
        {action && <View style={styles.actionWrap}>{action}</View>}
      </View>
      <View style={styles.body}>{children}</View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={cardStyle}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}
