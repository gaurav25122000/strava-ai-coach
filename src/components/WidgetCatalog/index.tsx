import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronUp, Plus, Search } from 'lucide-react-native';
import { Icon } from '../Icon';
import { StaggerItem } from '../Stagger';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { WIDGET_FAMILY, WIDGET_GROUP_ORDER, WidgetFamily, familyStyle } from '../../utils/widgetFamilies';
import { styles } from './styles';

export interface WidgetCatalogEntry {
  id: string;
  title: string;        // User-facing label.
  family?: WidgetFamily; // Defaults to the lookup in WIDGET_FAMILY.
  description?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Full catalog of widgets the screen knows how to render. */
  catalog: WidgetCatalogEntry[];
  /** Currently active widget ids, in render order. */
  activeIds: string[];
  /** Toggle a widget on/off in the current layout. */
  onToggle: (id: string) => void;
  /** Move an active widget up or down by one position. */
  onMove: (id: string, direction: 'up' | 'down') => void;
}

// Build a search-filtered, family-grouped view of the catalog. Same input,
// same output — pulled into a hook so the component body stays declarative.
function useGroupedCatalog(
  catalog: WidgetCatalogEntry[],
  activeIds: string[],
  query: string,
) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (e: WidgetCatalogEntry) =>
      !needle
        || e.title.toLowerCase().includes(needle)
        || e.id.toLowerCase().includes(needle)
        || (e.description?.toLowerCase().includes(needle) ?? false);

    const active: WidgetCatalogEntry[] = [];
    const activeOrder = new Map(activeIds.map((id, i) => [id, i]));
    for (const id of activeIds) {
      const entry = catalog.find(e => e.id === id);
      if (entry && matches(entry)) active.push(entry);
    }

    const hiddenByFamily = new Map<WidgetFamily, WidgetCatalogEntry[]>();
    for (const entry of catalog) {
      if (activeOrder.has(entry.id)) continue;
      if (!matches(entry)) continue;
      const fam = entry.family || WIDGET_FAMILY[entry.id] || 'activity';
      const bucket = hiddenByFamily.get(fam) || [];
      bucket.push(entry);
      hiddenByFamily.set(fam, bucket);
    }

    return { active, hiddenByFamily };
  }, [catalog, activeIds, query]);
}

/**
 * Reusable widget catalog modal. Active widgets show with up/down reorder
 * controls; hidden widgets are grouped by family (Activity / Health / Plan /
 * Recovery / Records / Progress / Social) with a coloured accent bar so the
 * user can scan by category. Search filters across active + hidden.
 */
export function WidgetCatalog({ visible, onClose, catalog, activeIds, onToggle, onMove }: Props) {
  const [query, setQuery] = useState('');
  const { active, hiddenByFamily } = useGroupedCatalog(catalog, activeIds, query);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Typography style={styles.title}>Customise Dashboard</Typography>
          <TouchableOpacity onPress={onClose}>
            <Typography style={styles.done}>Done</Typography>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Typography style={styles.intro}>
            Turn widgets on or off, reorder the active ones, or search to find a specific tile. Colours reflect the widget's family (Plan, Activity, Health, Recovery, Records, Progress).
          </Typography>

          <View style={styles.searchWrap}>
            <Icon icon={Search} variant="plain" size="sm" color={theme.colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search widgets…"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Active widgets, in render order, with reorder + toggle controls */}
          {active.length > 0 && (
            <>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: theme.colors.primary }]} />
                <Typography style={[styles.groupLabel, { color: theme.colors.primary }]}>
                  On the dashboard
                </Typography>
                <Typography style={styles.groupCount}>{active.length}</Typography>
              </View>
              {active.map((entry, idx) => {
                const fam = entry.family || WIDGET_FAMILY[entry.id] || 'activity';
                const style = familyStyle(fam);
                const isFirst = idx === 0;
                const isLast = idx === active.length - 1;
                return (
                  <StaggerItem key={entry.id} index={idx} step={14} maxIndex={6} style={[styles.row, styles.rowActive]}>
                    <View style={[styles.rowAccentBar, { backgroundColor: style.accent }]} />
                    <View style={styles.rowBody}>
                      <Typography style={styles.rowTitle}>{entry.title}</Typography>
                      <Typography style={[styles.rowFamily, { color: style.accent }]}>{style.label}</Typography>
                    </View>
                    <View style={styles.rowControls}>
                      <TouchableOpacity
                        onPress={() => onMove(entry.id, 'up')}
                        disabled={isFirst}
                        style={[styles.iconBtn, isFirst && { opacity: 0.3 }]}
                        accessibilityLabel={`Move ${entry.title} up`}
                        accessibilityRole="button"
                      >
                        <Icon icon={ChevronUp} variant="plain" size="md" color={theme.colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onMove(entry.id, 'down')}
                        disabled={isLast}
                        style={[styles.iconBtn, isLast && { opacity: 0.3 }]}
                        accessibilityLabel={`Move ${entry.title} down`}
                        accessibilityRole="button"
                      >
                        <Icon icon={ChevronDown} variant="plain" size="md" color={theme.colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onToggle(entry.id)}
                        style={[styles.toggle, styles.toggleOn]}
                        accessibilityLabel={`Remove ${entry.title} from dashboard`}
                        accessibilityRole="button"
                      >
                        <Icon icon={Check} variant="plain" size="sm" color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </StaggerItem>
                );
              })}
            </>
          )}

          {/* Hidden widgets grouped by family in canonical order */}
          {WIDGET_GROUP_ORDER.map(fam => {
            const bucket = hiddenByFamily.get(fam);
            if (!bucket?.length) return null;
            const style = familyStyle(fam);
            return (
              <React.Fragment key={fam}>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: style.accent }]} />
                  <Typography style={[styles.groupLabel, { color: style.accent }]}>
                    {style.label}
                  </Typography>
                  <Typography style={styles.groupCount}>{bucket.length}</Typography>
                </View>
                {bucket.map((entry, idx) => (
                  <StaggerItem key={entry.id} index={idx} step={14} maxIndex={6} style={[styles.row, styles.rowHidden]}>
                    <View style={[styles.rowAccentBar, { backgroundColor: style.accent }]} />
                    <View style={styles.rowBody}>
                      <Typography style={[styles.rowTitle, styles.rowTitleHidden]}>{entry.title}</Typography>
                      <Typography style={[styles.rowFamily, { color: style.accent }]}>{style.label}</Typography>
                    </View>
                    <TouchableOpacity
                      onPress={() => onToggle(entry.id)}
                      style={[styles.toggle, styles.toggleOff]}
                      accessibilityLabel={`Add ${entry.title} to dashboard`}
                      accessibilityRole="button"
                    >
                      <Icon icon={Plus} variant="plain" size="sm" color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </StaggerItem>
                ))}
              </React.Fragment>
            );
          })}

          {active.length === 0 && hiddenByFamily.size === 0 && (
            <Typography style={styles.emptyText}>No widgets match "{query}".</Typography>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
