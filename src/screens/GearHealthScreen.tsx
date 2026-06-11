import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { DonutRing } from '../components/DonutRing';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { WidgetCard } from '../components/WidgetCard';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Skeleton } from '../components/Skeleton';
import { StaggerItem } from '../components/Stagger';
import { FieldBlock, SectionLabel, SegmentedControl } from '../components/SheetUI';
import { familyStyle } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { performStravaSync } from '../services/syncRunner';
import {
  Plus, AlertCircle, Footprints, Heart,
  Pencil, Activity, Check, Trash2, ChevronLeft,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';

// Default shoe lifespan when the pair has no per-shoe lifespan set. Mirrors
// the ShoeTracker widget's fallback.
const DEFAULT_LIFESPAN_KM = 600;
// Past this share of the lifespan the wear ring switches to warning colours.
const WEAR_WARN_RATIO = 0.8;

type Severity = 'Low' | 'Medium' | 'High';
const SEVERITY_COLOR: Record<Severity, string> = {
  Low: theme.colors.success,
  Medium: theme.colors.warning,
  High: theme.colors.error,
};

const successHaptic = () => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

// Shape-matched skeleton card used while the persisted shoes list is hydrating
// from storage. Mirrors the real WidgetCard layout (icon, title, body, donut)
// so the page doesn't jump when real data lands.
function ShoeSkeletonCard() {
  return (
    <View style={styles.shoeSkeletonCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Skeleton width={32} height={32} radius={10} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width={'55%' as any} height={14} />
          <Skeleton width={'30%' as any} height={10} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={28} width={'40%' as any} />
          <Skeleton height={12} width={'70%' as any} />
        </View>
        <Skeleton width={76} height={76} radius={38} />
      </View>
    </View>
  );
}

interface ShoeForm {
  id?: string;
  brand: string;
  name: string;
  distance: string;        // string so the TextInput can be empty
  lifespan: string;        // km; empty = use the 600 km default
  addedAt?: string;        // ISO date
  retired?: boolean;
}

// Donut wear readout — track + progress arc with "% used" in the centre.
function DonutProgress({
  size = 76, stroke = 8, progress, color, trackColor,
}: { size?: number; stroke?: number; progress: number; color: string; trackColor: string }) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <DonutRing size={size} stroke={stroke} progress={clamped} color={color} trackColor={trackColor}>
      <Typography style={styles.donutPct}>
        {Math.round(clamped * 100)}
      </Typography>
      <Typography style={styles.donutPctLabel}>
        % USED
      </Typography>
    </DonutRing>
  );
}

export default function GearHealthScreen() {
  const shoes = useStore(s => s.shoes);
  const injuries = useStore(s => s.injuries);
  const addShoe = useStore(s => s.addShoe);
  const setShoes = useStore(s => s.setShoes);
  const addInjury = useStore(s => s.addInjury);
  const updateInjury = useStore(s => s.updateInjury);
  const removeInjury = useStore(s => s.removeInjury);
  const setToast = useStore(s => s.setToast);
  const navigation = useNavigation<any>();

  const [shoeForm, setShoeForm] = useState<ShoeForm | null>(null);
  const [injuryType, setInjuryType] = useState('');
  const [injurySeverity, setInjurySeverity] = useState<Severity>('Medium');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: string } | null>(null);

  // Real pull-to-refresh: run a forced Strava sync so shoe mileage and any
  // synced data actually update (replaces the old cosmetic 600 ms spinner).
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await performStravaSync({ force: true });
      if (result && result.synced > 0) {
        setToast({ title: 'Synced', message: `${result.synced} activities updated.`, type: 'success' });
      }
    } catch {
      setToast({ title: 'Sync failed', message: 'Could not refresh from Strava.', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [setToast]);

  const activeShoes = useMemo(() => shoes.filter(s => !(s as any).retired), [shoes]);
  const retiredShoes = useMemo(() => shoes.filter(s => !!(s as any).retired), [shoes]);

  // Injuries keep their full history in the store; this screen treats anything
  // without a resolvedAt stamp as active.
  const activeInjuries = useMemo(() => injuries.filter(i => !i.resolvedAt), [injuries]);
  const resolvedInjuries = useMemo(() => injuries.filter(i => !!i.resolvedAt), [injuries]);

  const openAddShoe = () => setShoeForm({ brand: '', name: '', distance: '0', lifespan: '' });
  const openEditShoe = (id: string) => {
    const s = shoes.find(x => x.id === id);
    if (!s) return;
    setShoeForm({
      id: s.id,
      brand: s.brand,
      name: s.name,
      distance: String(s.distance ?? 0),
      lifespan: s.lifespanKm ? String(s.lifespanKm) : '',
      addedAt: (s as any).addedAt,
      retired: (s as any).retired,
    });
  };

  const handleSaveShoe = () => {
    if (!shoeForm) return;
    if (!shoeForm.brand.trim() || !shoeForm.name.trim()) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setToast({ title: 'Missing fields', message: 'Brand and model are required.', type: 'error' });
      return;
    }
    const distanceNum = Math.max(0, Number(shoeForm.distance) || 0);
    const lifespanNum = Math.round(Number(shoeForm.lifespan) || 0);
    const lifespanKm = lifespanNum > 0 ? lifespanNum : undefined;
    if (shoeForm.id) {
      // Edit in place — the store only exposes setShoes, so splice ourselves.
      setShoes(shoes.map(s => s.id === shoeForm.id ? {
        ...s,
        brand: shoeForm.brand.trim(),
        name: shoeForm.name.trim(),
        distance: distanceNum,
        lifespanKm,
        ...((shoeForm.addedAt ? { addedAt: shoeForm.addedAt } : {}) as any),
      } : s));
      successHaptic();
      setToast({ title: 'Saved', message: 'Shoe updated.', type: 'success' });
    } else {
      addShoe({
        id: Date.now().toString(),
        brand: shoeForm.brand.trim(),
        name: shoeForm.name.trim(),
        distance: distanceNum,
        lifespanKm,
        ...({ addedAt: new Date().toISOString() } as any),
      });
      successHaptic();
      setToast({ title: 'Added', message: 'Shoe added to your gear list.', type: 'success' });
    }
    setShoeForm(null);
  };

  const handleRetireShoe = (id: string) => {
    setShoes(shoes.map(s => s.id === id ? { ...s, ...({ retired: true } as any) } : s));
    successHaptic();
    setToast({ title: 'Retired', message: 'Shoe moved to retired pairs.', type: 'success' });
  };

  const handleAddInjury = () => {
    if (!injuryType.trim()) return;
    addInjury({
      id: Date.now().toString(),
      type: injuryType.trim(),
      severity: injurySeverity,
      date: new Date().toISOString(),
    });
    setInjuryType('');
    setInjurySeverity('Medium');
    successHaptic();
    setToast({ title: 'Logged', message: 'AI Coach will adjust plans.', type: 'success' });
  };

  const handleResolveInjury = (id: string) => {
    const inj = injuries.find(i => i.id === id);
    if (!inj) return;
    updateInjury({ ...inj, resolvedAt: new Date().toISOString() });
    successHaptic();
    setToast({ title: 'Resolved', message: 'Glad you’re feeling better — moved to history.', type: 'success' });
  };

  const handleDeleteInjury = () => {
    if (!confirmDelete) return;
    removeInjury(confirmDelete.id);
    setConfirmDelete(null);
    successHaptic();
    setToast({ title: 'Deleted', message: 'Injury removed from your log.', type: 'success' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={familyStyle('activity').accent}
            colors={[familyStyle('activity').accent]}
          />
        }
      >

        {/* ── Hero strip (activity family gradient) ── */}
        <LinearGradient
          colors={theme.colors.gradients.activity}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroHeader}
        >
          <PressableScale
            onPress={() => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('MenuHome'); }}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={24} color={theme.colors.onAccent} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Typography style={styles.heroTitle}>Gear & Health</Typography>
            <Typography style={styles.heroSub}>Track shoe mileage and log injuries</Typography>
          </View>
        </LinearGradient>

        {/* ── Shoes section header with Add CTA ── */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: familyStyle('activity').accent }]} />
            <Icon icon={Footprints} variant="plain" size="sm" color={familyStyle('activity').accent} />
            <Typography style={styles.sectionTitle}>Shoes</Typography>
          </View>
          <Button
            title="Add Pair"
            icon={Plus}
            size="sm"
            variant="secondary"
            family="activity"
            onPress={openAddShoe}
          />
        </View>

        {/* ── Active Shoes ── */}
        {shoes == null ? (
          <View>
            <ShoeSkeletonCard />
            <ShoeSkeletonCard />
            <ShoeSkeletonCard />
          </View>
        ) : activeShoes.length === 0 ? (
          <StaggerItem index={0}>
            <View style={styles.emptyState}>
              <Icon icon={Footprints} family="activity" variant="glow" size="xl" style={styles.emptyIconWrap} />
              <Typography style={styles.emptyTitle}>No gear tracked yet</Typography>
              <Typography style={styles.emptySub}>
                Log every pair to keep an eye on mileage and avoid running on dead foam.
              </Typography>
              <Button
                title="Add Your First Pair"
                icon={Plus}
                family="activity"
                fullWidth
                onPress={openAddShoe}
                style={{ marginTop: 16 }}
              />
            </View>
          </StaggerItem>
        ) : (
          activeShoes.map((shoe, idx) => {
            const distance = shoe.distance || 0;
            const lifespanKm = shoe.lifespanKm ?? DEFAULT_LIFESPAN_KM;
            const pct = Math.min(distance / lifespanKm, 1);
            const overLimit = distance > lifespanKm;
            const warning = pct >= WEAR_WARN_RATIO && !overLimit;
            const ringColor = overLimit ? theme.colors.error : warning ? theme.colors.warning : theme.colors.success;
            const addedAtRaw: string | undefined = (shoe as any).addedAt;
            const days = addedAtRaw ? Math.max(1, Math.floor((Date.now() - new Date(addedAtRaw).getTime()) / 86400000)) : null;
            return (
              <StaggerItem key={shoe.id} index={idx}>
                <WidgetCard family="activity" title={shoe.name} caption={shoe.brand} icon={Footprints}>
                  <View style={styles.shoeRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View style={styles.shoeMileageRow}>
                        <AnimatedNumber value={distance} style={[styles.shoeKm, { color: ringColor }]} />
                        <Typography style={styles.shoeKmUnit}>/ {lifespanKm} km</Typography>
                      </View>
                      <View style={styles.shoeMetaRow}>
                        {days !== null && (
                          <View style={styles.shoeMetaChip}>
                            <Typography style={styles.shoeMetaChipText}>{days} day{days === 1 ? '' : 's'} in service</Typography>
                          </View>
                        )}
                        {overLimit ? (
                          <View style={[styles.shoeMetaChip, { backgroundColor: withAlpha(theme.colors.error, 'tint'), borderColor: withAlpha(theme.colors.error, 'strong') }]}>
                            <Icon icon={AlertCircle} variant="plain" size="xs" color={theme.colors.error} />
                            <Typography style={[styles.shoeMetaChipText, { color: theme.colors.error }]}>Consider rotating</Typography>
                          </View>
                        ) : warning ? (
                          <View style={[styles.shoeMetaChip, { backgroundColor: withAlpha(theme.colors.warning, 'tint'), borderColor: withAlpha(theme.colors.warning, 'strong') }]}>
                            <Typography style={[styles.shoeMetaChipText, { color: theme.colors.warning }]}>Approaching limit</Typography>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <DonutProgress
                      progress={pct}
                      color={ringColor}
                      trackColor={theme.colors.divider}
                    />
                  </View>

                  <View style={styles.shoeCtaRow}>
                    <Button
                      title="Retire"
                      size="sm"
                      variant="ghost"
                      onPress={() => handleRetireShoe(shoe.id)}
                    />
                    <Button
                      title="Edit"
                      icon={Pencil}
                      size="sm"
                      variant="secondary"
                      family="activity"
                      onPress={() => openEditShoe(shoe.id)}
                    />
                  </View>
                </WidgetCard>
              </StaggerItem>
            );
          })
        )}

        {/* ── Retired Shoes (collapsed list) ── */}
        {retiredShoes.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 16 }}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: theme.colors.textSecondary }]} />
              <Typography style={styles.sectionTitle}>Retired Pairs</Typography>
            </View>
            {retiredShoes.map(shoe => (
              <Animated.View
                key={shoe.id}
                entering={FadeIn}
                style={styles.retiredRow}
              >
                <Icon icon={Footprints} variant="plain" size="sm" color={theme.colors.textSecondary} />
                <Typography style={styles.retiredText} numberOfLines={1}>
                  {shoe.brand} · {shoe.name}
                </Typography>
                <Typography style={styles.retiredKm}>{shoe.distance} km</Typography>
              </Animated.View>
            ))}
          </View>
        )}

        {/* ── Injuries ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: theme.colors.error }]} />
            <Icon icon={Heart} variant="plain" size="sm" color={theme.colors.error} />
            <Typography style={styles.sectionTitle}>Injury Log</Typography>
          </View>

          {activeInjuries.length === 0 ? (
            <View style={styles.emptyInjury}>
              <Icon icon={Activity} variant="plain" size="xl" color={theme.colors.success} />
              <Typography style={styles.emptyInjuryTitle}>No active injuries</Typography>
              <Typography style={styles.emptyInjurySub}>Log any niggles below so your AI coach can adjust load.</Typography>
            </View>
          ) : activeInjuries.map((inj, idx) => {
            const sevColor = SEVERITY_COLOR[inj.severity] ?? theme.colors.error;
            return (
              <StaggerItem key={inj.id} index={idx}>
                <WidgetCard family="health" title={inj.type} icon={Heart} caption={new Date(inj.date).toLocaleDateString()}>
                  <View style={styles.injuryRow}>
                    <Typography style={styles.injuryDate}>Logged: {new Date(inj.date).toLocaleDateString()}</Typography>
                    <View style={[styles.severityChip, { backgroundColor: withAlpha(sevColor, 'tint'), borderColor: withAlpha(sevColor, 'strong') }]}>
                      <Typography style={[styles.severityText, { color: sevColor }]}>{inj.severity}</Typography>
                    </View>
                  </View>
                  <View style={styles.injuryCtaRow}>
                    <Button
                      title="Delete"
                      icon={Trash2}
                      size="sm"
                      variant="ghost"
                      onPress={() => setConfirmDelete({ id: inj.id, type: inj.type })}
                    />
                    <Button
                      title="Mark Resolved"
                      icon={Check}
                      size="sm"
                      variant="secondary"
                      family="health"
                      onPress={() => handleResolveInjury(inj.id)}
                    />
                  </View>
                </WidgetCard>
              </StaggerItem>
            );
          })}

          {/* Resolved history — muted rows, still deletable */}
          {resolvedInjuries.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionAccent, { backgroundColor: theme.colors.textSecondary }]} />
                <Typography style={styles.sectionTitle}>Resolved</Typography>
              </View>
              {resolvedInjuries.map(inj => (
                <Animated.View key={inj.id} entering={FadeIn} style={styles.retiredRow}>
                  <Icon icon={Check} variant="plain" size="sm" color={theme.colors.success} />
                  <Typography style={styles.retiredText} numberOfLines={1}>
                    {inj.type}
                  </Typography>
                  <Typography style={styles.retiredKm}>
                    {inj.resolvedAt ? new Date(inj.resolvedAt).toLocaleDateString() : ''}
                  </Typography>
                  <Button
                    title="Delete"
                    size="sm"
                    variant="ghost"
                    onPress={() => setConfirmDelete({ id: inj.id, type: inj.type })}
                  />
                </Animated.View>
              ))}
            </View>
          )}

          {/* Log a new issue */}
          <View style={styles.addInjuryCard}>
            <FieldBlock
              label="Injury"
              family="health"
              value={injuryType}
              onChangeText={setInjuryType}
              placeholder="Describe pain/injury (e.g. Right knee ache)"
              autoCapitalize="sentences"
            />
            <SectionLabel family="health">Severity</SectionLabel>
            <SegmentedControl<Severity>
              family="health"
              segments={[
                { value: 'Low', label: 'Low' },
                { value: 'Medium', label: 'Medium' },
                { value: 'High', label: 'High' },
              ]}
              value={injurySeverity}
              onChange={setInjurySeverity}
            />
            <Button
              title="Log Issue"
              icon={AlertCircle}
              family="health"
              fullWidth
              disabled={!injuryType.trim()}
              onPress={handleAddInjury}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>

      </ScrollView>

      {/* ── Add / Edit Shoe Sheet ── */}
      <Sheet
        visible={!!shoeForm}
        onClose={() => setShoeForm(null)}
        title={shoeForm?.id ? 'Edit Pair' : 'Add Gear'}
        caption="Track mileage for this pair of shoes"
        scrollable
      >
        <SectionLabel family="activity">Shoe</SectionLabel>
        <FieldBlock
          label="Brand"
          family="activity"
          value={shoeForm?.brand || ''}
          onChangeText={v => setShoeForm(f => f ? { ...f, brand: v } : f)}
          placeholder="e.g. Nike"
          autoFocus={!shoeForm?.id}
          autoCapitalize="words"
        />
        <FieldBlock
          label="Model"
          family="activity"
          value={shoeForm?.name || ''}
          onChangeText={v => setShoeForm(f => f ? { ...f, name: v } : f)}
          placeholder="e.g. Alphafly 3"
          autoCapitalize="words"
        />

        <SectionLabel family="activity">Mileage</SectionLabel>
        <FieldBlock
          label="Current Mileage (km)"
          family="activity"
          value={shoeForm?.distance || ''}
          onChangeText={v => setShoeForm(f => f ? { ...f, distance: v.replace(/[^0-9.]/g, '') } : f)}
          placeholder="0"
          keyboardType="numeric"
          numeric
          helper="Defaults to 0 for new shoes"
        />
        <FieldBlock
          label="Lifespan (km)"
          family="activity"
          value={shoeForm?.lifespan || ''}
          onChangeText={v => setShoeForm(f => f ? { ...f, lifespan: v.replace(/[^0-9]/g, '') } : f)}
          placeholder={String(DEFAULT_LIFESPAN_KM)}
          keyboardType="numeric"
          numeric
          helper={`When to consider replacing — leave empty for the ${DEFAULT_LIFESPAN_KM} km default`}
        />

        <Button
          title={shoeForm?.id ? 'Save Changes' : 'Save Shoe'}
          icon={Footprints}
          family="activity"
          fullWidth
          onPress={handleSaveShoe}
          style={{ marginTop: 4 }}
        />
      </Sheet>

      {/* ── Delete injury confirm ── */}
      <Sheet
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete injury?"
        caption={confirmDelete ? `"${confirmDelete.type}" will be removed from your log permanently.` : undefined}
      >
        <Button
          title="Delete"
          variant="destructive"
          icon={Trash2}
          fullWidth
          onPress={handleDeleteInjury}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Cancel"
          variant="ghost"
          fullWidth
          onPress={() => setConfirmDelete(null)}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    // Clear the floating dock, like every other Menu-stack screen.
    paddingBottom: 130,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 22,
    marginBottom: 16,
  },
  heroTitle: { fontSize: 26, fontFamily: theme.fonts.display, color: theme.colors.onAccent, letterSpacing: -0.5 },
  heroSub: { fontSize: 12, color: withAlpha(theme.colors.onAccent, 'heavy'), marginTop: 4, fontWeight: '600' },

  // Shape-matched skeleton card while shoes hydrate from storage. Mirrors
  // WidgetCard geometry — edge-to-edge, lg horizontal padding, bottom divider —
  // so the left/right edges don't jog when real cards land.
  shoeSkeletonCard: {
    marginHorizontal: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg, marginBottom: theme.spacing.xl,
    backgroundColor: 'transparent',
    borderBottomWidth: 1, borderBottomColor: withAlpha(theme.colors.border, 'strong'),
  },

  // Shoe card body
  shoeRow: { flexDirection: 'row', alignItems: 'center' },
  shoeMileageRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  shoeKm: { ...theme.typography.numeric, fontSize: 32, lineHeight: 38 },
  shoeKmUnit: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '700' },
  shoeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  shoeMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  shoeMetaChipText: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700', letterSpacing: 0.3 },

  shoeCtaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.divider,
  },

  // Retired / resolved list rows
  retiredRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 10,
    marginBottom: 6,
    minHeight: 44,
  },
  retiredText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  retiredKm: { color: theme.colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },

  // Section
  section: { marginBottom: 24, marginHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 4,
  },
  sectionAccent: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, letterSpacing: 1.2, textTransform: 'uppercase' },

  // Donut centre readout — small tabular numeric so the % doesn't jitter width
  // as the ring sweeps 0->100.
  donutPct: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  donutPctLabel: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', letterSpacing: 0.6, marginTop: -2 },

  // Empty state (shoes)
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 36, paddingHorizontal: 28,
    marginHorizontal: theme.spacing.lg, marginBottom: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  emptySub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  // Injuries
  emptyInjury: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, paddingHorizontal: 24,
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: withAlpha(theme.colors.success, 'tint'),
  },
  emptyInjuryTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 10 },
  emptyInjurySub: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 4 },

  injuryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  severityChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  severityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  injuryDate: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  injuryCtaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.divider,
  },

  addInjuryCard: {
    padding: 14, marginTop: 12, gap: 8,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
});
