import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Eye, EyeOff, GripVertical, Plus, Search, X } from 'lucide-react-native';
import { Typography } from '../Typography';
import { Button } from '../Button';
import { PressableScale } from '../PressableScale';
import { theme, withAlpha } from '../../theme';
import {
  WIDGET_FAMILY,
  WIDGET_GROUP_ORDER,
  WIDGET_TITLES,
  familyStyle,
  WidgetFamily,
} from '../../utils/widgetFamilies';
import { WIDGET_REGISTRY } from '../../widgets/registry';
import { getActivitySource, HEALTH_HIDDEN_WIDGETS } from '../../services/activitySource';

const ROW_H = 62; // fixed row height — drag math depends on it (56 row + 6 gap)

interface WidgetCatalogProps {
  visible: boolean;
  activeIds: string[];
  onClose: () => void;
  /** Single commit — the parent persists once, not per tap. */
  onSave: (ids: string[]) => void;
}

function hapticTick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync();
}

// One draggable active-widget row. Fixed-height rows make reordering pure
// math: target index = start index + round(translationY / ROW_H).
const ActiveRow = memo(function ActiveRow({
  id,
  index,
  count,
  dragIndex,
  hoverIndex,
  dragY,
  onReorder,
  onHide,
  setScrollEnabled,
}: {
  id: string;
  index: number;
  count: number;
  dragIndex: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onReorder: (from: number, to: number) => void;
  onHide: (id: string) => void;
  setScrollEnabled: (enabled: boolean) => void;
}) {
  const fam = familyStyle(WIDGET_FAMILY[id] ?? 'plan');

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      dragIndex.value = index;
      hoverIndex.value = index;
      dragY.value = 0;
      runOnJS(setScrollEnabled)(false);
      runOnJS(hapticTick)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
      const target = Math.max(0, Math.min(count - 1, index + Math.round(e.translationY / ROW_H)));
      if (target !== hoverIndex.value) {
        hoverIndex.value = target;
        runOnJS(hapticTick)();
      }
    })
    .onFinalize(() => {
      const from = dragIndex.value;
      const to = hoverIndex.value;
      dragIndex.value = -1;
      hoverIndex.value = -1;
      dragY.value = 0;
      runOnJS(setScrollEnabled)(true);
      if (from >= 0 && to >= 0 && from !== to) runOnJS(onReorder)(from, to);
    });

  const style = useAnimatedStyle(() => {
    const dragging = dragIndex.value === index;
    if (dragging) {
      return {
        transform: [{ translateY: dragY.value }, { scale: withTiming(1.03, { duration: 120 }) }],
        zIndex: 10,
        shadowOpacity: 0.4,
        elevation: 8,
      };
    }
    // Rows between the drag origin and the hover slot shift one slot over.
    let shift = 0;
    if (dragIndex.value >= 0) {
      if (index > dragIndex.value && index <= hoverIndex.value) shift = -ROW_H;
      else if (index < dragIndex.value && index >= hoverIndex.value) shift = ROW_H;
    }
    return {
      transform: [{ translateY: withSpring(shift, theme.motion.springSnappy) }, { scale: withTiming(1, { duration: 120 }) }],
      zIndex: 0,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  return (
    <Animated.View style={[styles.row, styles.rowShadowBase, style]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={styles.grip} hitSlop={theme.hitSlop}>
          <GripVertical size={18} color={theme.colors.textSecondary} />
        </Animated.View>
      </GestureDetector>
      <View style={[styles.famDot, { backgroundColor: fam.accent }]} />
      <View style={styles.rowText}>
        <Typography style={styles.rowTitle} numberOfLines={1}>{WIDGET_TITLES[id] ?? id}</Typography>
        <Typography style={[styles.rowCaption, { color: fam.accent }]}>{fam.label}</Typography>
      </View>
      <PressableScale onPress={() => onHide(id)} hitSlop={theme.hitSlop} accessibilityLabel={`Hide ${WIDGET_TITLES[id] ?? id}`}>
        <EyeOff size={18} color={theme.colors.textSecondary} />
      </PressableScale>
    </Animated.View>
  );
});

const HiddenRow = memo(function HiddenRow({ id, onAdd }: { id: string; onAdd: (id: string) => void }) {
  const fam = familyStyle(WIDGET_FAMILY[id] ?? 'plan');
  return (
    <View style={styles.row}>
      <View style={[styles.famDot, { backgroundColor: withAlpha(fam.accent, 'heavy'), marginLeft: 30 }]} />
      <View style={styles.rowText}>
        <Typography style={[styles.rowTitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {WIDGET_TITLES[id] ?? id}
        </Typography>
      </View>
      <PressableScale
        onPress={() => onAdd(id)}
        style={[styles.addBtn, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
        accessibilityLabel={`Show ${WIDGET_TITLES[id] ?? id}`}
      >
        <Plus size={16} color={fam.accent} strokeWidth={2.5} />
      </PressableScale>
    </View>
  );
});

/**
 * Customise-dashboard editor. All edits live in a local draft — drag, hide,
 * add freely with ZERO store writes; Save commits once. (The old version
 * persisted the full app state to AsyncStorage and re-rendered the entire
 * dashboard behind the modal on every single tap — the lag the user felt.)
 */
export function WidgetCatalog({ visible, activeIds, onClose, onSave }: WidgetCatalogProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<string[]>(activeIds);
  const [query, setQuery] = useState('');
  const [scrollOk, setScrollOk] = useState(true);

  const dragIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);

  // Re-seed the draft each time the editor opens.
  useEffect(() => {
    if (visible) {
      setDraft(activeIds);
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const hidden = useMemo(() => {
    const active = new Set(draft);
    const healthSource = getActivitySource() === 'health';
    const byFamily = new Map<WidgetFamily, string[]>();
    for (const id of Object.keys(WIDGET_REGISTRY)) {
      if (active.has(id)) continue;
      // Strava-only widgets aren't offered while the health source is active.
      if (healthSource && HEALTH_HIDDEN_WIDGETS.has(id)) continue;
      const fam = WIDGET_FAMILY[id] ?? 'plan';
      byFamily.set(fam, [...(byFamily.get(fam) ?? []), id]);
    }
    return WIDGET_GROUP_ORDER.filter((f) => byFamily.has(f)).map((f) => ({ family: f, ids: byFamily.get(f)! }));
  }, [draft]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (id: string) => !q || (WIDGET_TITLES[id] ?? id).toLowerCase().includes(q) || id.toLowerCase().includes(q),
    [q],
  );

  const visibleDraft = useMemo(() => draft.filter(matches), [draft, matches]);
  const dragEnabled = !q; // index math assumes the unfiltered list

  const reorder = useCallback((from: number, to: number) => {
    setDraft((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const hide = useCallback((id: string) => {
    hapticTick();
    setDraft((cur) => cur.filter((x) => x !== id));
  }, []);

  const add = useCallback((id: string) => {
    hapticTick();
    setDraft((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }, []);

  const dirty = useMemo(
    () => draft.length !== activeIds.length || draft.some((id, i) => activeIds[i] !== id),
    [draft, activeIds],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* Android: gestures inside an RN Modal need their own gesture root —
          without it GestureDetector rows never receive touches there. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8 }]}>
        <View style={styles.header}>
          <PressableScale onPress={onClose} hitSlop={theme.hitSlop} accessibilityLabel="Close customise">
            <X size={22} color={theme.colors.textSecondary} />
          </PressableScale>
          <Typography style={styles.headerTitle}>Customise</Typography>
          <Button title="Save" size="sm" disabled={!dirty} onPress={() => { onSave(draft); onClose(); }} />
        </View>

        <View style={styles.searchWrap}>
          <Search size={16} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search widgets"
            placeholderTextColor={theme.colors.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView
          scrollEnabled={scrollOk}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Eye size={14} color={theme.colors.textSecondary} />
            <Typography style={styles.sectionLabel}>ON YOUR DASHBOARD · {draft.length}</Typography>
          </View>
          {!dragEnabled && visibleDraft.length > 0 && (
            <Typography style={styles.dragHint}>Clear the search to reorder.</Typography>
          )}
          {(dragEnabled ? draft : visibleDraft).map((id, index) => (
            <ActiveRow
              key={id}
              id={id}
              index={index}
              count={draft.length}
              dragIndex={dragIndex}
              hoverIndex={hoverIndex}
              dragY={dragY}
              onReorder={dragEnabled ? reorder : () => {}}
              onHide={hide}
              setScrollEnabled={setScrollOk}
            />
          ))}

          {hidden.map(({ family, ids }) => {
            const shown = ids.filter(matches);
            if (!shown.length) return null;
            const fam = familyStyle(family);
            return (
              <View key={family}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.famDot, { backgroundColor: fam.accent }]} />
                  <Typography style={styles.sectionLabel}>{fam.label.toUpperCase()}</Typography>
                </View>
                {shown.map((id) => (
                  <HiddenRow key={id} id={id} onAdd={add} />
                ))}
              </View>
            );
          })}
        </ScrollView>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  headerTitle: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    height: 40,
    marginVertical: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    ...theme.typography.body,
    paddingVertical: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
  },
  dragHint: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  row: {
    height: ROW_H - 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  rowShadowBase: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  grip: {
    paddingVertical: 14,
    paddingRight: 2,
  },
  famDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  rowCaption: {
    ...theme.typography.micro,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
