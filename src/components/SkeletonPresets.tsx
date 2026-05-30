import React from 'react';
import { View } from 'react-native';
import { Skeleton } from './Skeleton';
import { theme } from '../theme';

/**
 * Preset layouts for common loading skeletons. Use these where a widget /
 * row / hero is about to mount but data is still loading. Each preset matches
 * the rough dimensions of its real counterpart so the layout doesn't jump.
 */

export const SkeletonWidget = () => (
  <View style={{ marginBottom: theme.spacing.xl, paddingBottom: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border + '66' }}>
    <Skeleton width={28} height={2} radius={1} style={{ marginLeft: theme.spacing.lg, marginBottom: 8 }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: 10 }}>
      <Skeleton width={28} height={28} radius={9} />
      <View style={{ flex: 1, gap: 4 }}>
        <Skeleton width={'50%' as any} height={14} />
        <Skeleton width={'30%' as any} height={9} />
      </View>
    </View>
    <View style={{ paddingHorizontal: theme.spacing.lg, gap: 8 }}>
      <Skeleton height={28} width={'40%' as any} />
      <Skeleton height={100} />
    </View>
  </View>
);

export const SkeletonActivityRow = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.border }}>
    <Skeleton width={28} height={28} radius={9} />
    <View style={{ flex: 1, gap: 6 }}>
      <Skeleton width={'60%' as any} height={14} />
      <Skeleton width={'40%' as any} height={10} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Skeleton width={56} height={14} radius={7} />
        <Skeleton width={56} height={14} radius={7} />
        <Skeleton width={56} height={14} radius={7} />
      </View>
    </View>
    <Skeleton width={4} height={32} radius={2} />
  </View>
);

export const SkeletonHero = () => (
  <View style={{ marginBottom: theme.spacing.lg }}>
    <Skeleton height={140} radius={theme.borderRadius.xl} style={{ marginHorizontal: 16 }} />
  </View>
);

export const SkeletonChart = ({ height = 180 }: { height?: number }) => (
  <View style={{ paddingHorizontal: theme.spacing.lg, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ gap: 4 }}>
        <Skeleton width={80} height={28} />
        <Skeleton width={50} height={10} />
      </View>
      <Skeleton width={56} height={20} radius={10} />
    </View>
    <Skeleton height={height} radius={theme.borderRadius.md} />
  </View>
);

export const SkeletonStatGrid = ({ rows = 2, cols = 3 }: { rows?: number; cols?: number }) => {
  const cells = Array.from({ length: rows * cols });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.lg, gap: 10 }}>
      {cells.map((_, i) => (
        <View key={i} style={{ width: `${(100 - (cols - 1) * 2) / cols}%`, gap: 6, padding: 10, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.border }}>
          <Skeleton width={20} height={20} radius={6} />
          <Skeleton height={20} />
          <Skeleton width={'60%' as any} height={10} />
        </View>
      ))}
    </View>
  );
};

export const SkeletonChatMessage = ({ side = 'bot' as 'bot' | 'user' }: { side?: 'bot' | 'user' }) => (
  <View
    style={{
      alignSelf: side === 'user' ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
      padding: 10,
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      marginHorizontal: 16,
      marginBottom: 8,
      gap: 6,
    }}
  >
    <Skeleton width={180} height={12} />
    <Skeleton width={140} height={12} />
  </View>
);
