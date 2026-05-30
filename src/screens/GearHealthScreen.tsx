import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { DonutRing } from '../components/DonutRing';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { WidgetCard } from '../components/WidgetCard';
import { BottomSheet } from '../components/BottomSheet';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Skeleton } from '../components/Skeleton';
import { StaggerItem } from '../components/Stagger';
import { FieldBlock, SectionLabel, SheetCTA } from '../components/SheetUI';
import { familyStyle } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import {
  Plus, AlertCircle, Footprints, Heart,
  ChevronRight, Activity,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';

const SHOE_LIMIT_KM = 600;

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
  addedAt?: string;        // ISO date
  retired?: boolean;
}

// Pre-stroke a track + animated progress arc. Rendered as a donut sized to the
// caller — used here for shoe wear, but reusable for any 0-1 ratio readout.
function DonutProgress({
  size = 76, stroke = 8, progress, color, gradient, trackColor,
}: { size?: number; stroke?: number; progress: number; color: string; gradient?: [string, string]; trackColor: string }) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <DonutRing
      size={size}
      stroke={stroke}
      progress={clamped}
      color={color}
      gradient={gradient}
      trackColor={trackColor}
    >
      <Typography style={styles.donutPct}>
        {Math.round(clamped * 100)}
      </Typography>
      <Typography style={styles.donutPctLabel}>
        % USED
      </Typography>
    </DonutRing>
  );
}

const successHaptic = () => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

export default function GearHealthScreen() {
  const { shoes, injuries, addShoe, setShoes, addInjury, setToast } = useStore();
  const [shoeForm, setShoeForm] = useState<ShoeForm | null>(null);
  const [injuryType, setInjuryType] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    // Re-reads the persisted store so the gear list shows a branded pull-to-
    // refresh spinner; mileage stays local until activity sync writes it.
    setRefreshing(true);
    setShoes(useStore.getState().shoes);
    setTimeout(() => setRefreshing(false), 600);
  }, [setShoes]);

  const activeShoes = useMemo(() => shoes.filter(s => !(s as any).retired), [shoes]);
  const retiredShoes = useMemo(() => shoes.filter(s => !!(s as any).retired), [shoes]);

  const openAddShoe = () => setShoeForm({ brand: '', name: '', distance: '0' });
  const openEditShoe = (id: string) => {
    const s = shoes.find(x => x.id === id);
    if (!s) return;
    setShoeForm({
      id: s.id,
      brand: s.brand,
      name: s.name,
      distance: String(s.distance ?? 0),
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
    if (shoeForm.id) {
      // Edit in place — the store only exposes setShoes, so splice ourselves.
      setShoes(shoes.map(s => s.id === shoeForm.id ? {
        ...s,
        brand: shoeForm.brand.trim(),
        name: shoeForm.name.trim(),
        distance: distanceNum,
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
    addInjury({ id: Date.now().toString(), type: injuryType.trim(), severity: 'Medium', date: new Date().toISOString() });
    setInjuryType('');
    successHaptic();
    setToast({ title: 'Logged', message: 'AI Coach will adjust plans.', type: 'success' });
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
          <View style={{ flex: 1 }}>
            <Typography style={styles.heroTitle}>Gear & Health</Typography>
            <Typography style={styles.heroSub}>Track shoe mileage and log injuries</Typography>
          </View>
          <PressableScale
            style={styles.heroAddBtn}
            onPress={openAddShoe}
            scaleTo={0.96}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Add gear"
          >
            <Icon icon={Plus} variant="plain" size="md" color="#fff" />
            <Typography style={styles.heroAddBtnText}>Add Gear</Typography>
          </PressableScale>
        </LinearGradient>

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
              <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
                <SheetCTA
                  family="activity"
                  icon={Plus}
                  label="Add Your First Pair"
                  onPress={openAddShoe}
                />
              </View>
            </View>
          </StaggerItem>
        ) : (
          activeShoes.map((shoe, idx) => {
            const distance = shoe.distance || 0;
            const pct = Math.min(distance / SHOE_LIMIT_KM, 1);
            const overLimit = distance > SHOE_LIMIT_KM;
            const warning = pct > 0.8 && !overLimit;
            const ringColor = overLimit ? theme.colors.error : warning ? theme.colors.warning : theme.colors.success;
            const addedAtRaw: string | undefined = (shoe as any).addedAt;
            const days = addedAtRaw ? Math.max(1, Math.floor((Date.now() - new Date(addedAtRaw).getTime()) / 86400000)) : null;
            return (
              <StaggerItem
                key={shoe.id}
                index={idx}
              >
                <WidgetCard family="activity" title={shoe.name} caption={shoe.brand} icon={Footprints}>
                  <View style={styles.shoeRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View style={styles.shoeMileageRow}>
                        <AnimatedNumber value={distance} style={[styles.shoeKm, { color: ringColor }]} />
                        <Typography style={styles.shoeKmUnit}>/ {SHOE_LIMIT_KM} km</Typography>
                      </View>
                      <View style={styles.shoeMetaRow}>
                        {days !== null && (
                          <View style={styles.shoeMetaChip}>
                            <Typography style={styles.shoeMetaChipText}>{days} day{days === 1 ? '' : 's'} in service</Typography>
                          </View>
                        )}
                        {overLimit ? (
                          <View style={[styles.shoeMetaChip, { backgroundColor: theme.colors.error + '22', borderColor: theme.colors.error + '55' }]}>
                            <Icon icon={AlertCircle} variant="plain" size="xs" color={theme.colors.error} />
                            <Typography style={[styles.shoeMetaChipText, { color: theme.colors.error }]}>Consider rotating</Typography>
                          </View>
                        ) : warning ? (
                          <View style={[styles.shoeMetaChip, { backgroundColor: theme.colors.warning + '22', borderColor: theme.colors.warning + '55' }]}>
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
                    <PressableScale
                      onPress={() => handleRetireShoe(shoe.id)}
                      style={styles.retireBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${shoe.brand} ${shoe.name} as retired`}
                    >
                      <Typography style={styles.retireBtnText}>Mark as Retired</Typography>
                    </PressableScale>
                    <PressableScale
                      onPress={() => openEditShoe(shoe.id)}
                      style={styles.editBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${shoe.brand} ${shoe.name}`}
                    >
                      <Typography style={styles.editBtnText}>Edit</Typography>
                      <Icon icon={ChevronRight} variant="plain" size="sm" color={theme.colors.text} />
                    </PressableScale>
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

          {injuries.length === 0 ? (
            <View style={styles.emptyInjury}>
              <Icon icon={Activity} variant="plain" size="xl" color={theme.colors.success} />
              <Typography style={styles.emptyInjuryTitle}>No injuries logged</Typography>
              <Typography style={styles.emptyInjurySub}>Log any niggles so your AI coach can adjust load.</Typography>
            </View>
          ) : injuries.map((inj, idx) => (
            <StaggerItem
              key={inj.id}
              index={idx}
            >
              <WidgetCard family="health" title={inj.type} icon={Heart} caption={new Date(inj.date).toLocaleDateString()}>
                <View style={styles.injuryRow}>
                  <Typography style={styles.injuryDate}>Logged: {new Date(inj.date).toLocaleDateString()}</Typography>
                  <View style={[styles.severityChip, { backgroundColor: theme.colors.error + '22', borderColor: theme.colors.error + '55' }]}>
                    <Typography style={[styles.severityText, { color: theme.colors.error }]}>{inj.severity}</Typography>
                  </View>
                </View>
              </WidgetCard>
            </StaggerItem>
          ))}

          <View style={styles.addInjuryCard}>
            <FieldBlock
              label="Injury"
              family="health"
              value={injuryType}
              onChangeText={setInjuryType}
              placeholder="Describe pain/injury (e.g. Right knee ache)"
              autoCapitalize="sentences"
            />
            <SheetCTA
              family="health"
              icon={AlertCircle}
              label="Log Issue"
              onPress={handleAddInjury}
            />
          </View>
        </View>

      </ScrollView>

      {/* ── Add / Edit Shoe Modal ── */}
      <BottomSheet
        visible={!!shoeForm}
        onClose={() => setShoeForm(null)}
        title={shoeForm?.id ? 'Edit Pair' : 'Add Gear'}
        subtitle="Track mileage for this pair of shoes"
        icon={Footprints}
        family="activity"
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

        <SheetCTA
          family="activity"
          icon={Footprints}
          label={shoeForm?.id ? 'Save Changes' : 'Save Shoe'}
          onPress={handleSaveShoe}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 22,
    marginBottom: 16,
  },
  heroTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '600' },
  heroAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  heroAddBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Shape-matched skeleton card while shoes hydrate from storage. Mirrors
  // WidgetCard geometry — edge-to-edge, lg horizontal padding, bottom divider —
  // so the left/right edges don't jog when real cards land.
  shoeSkeletonCard: {
    marginHorizontal: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg, marginBottom: theme.spacing.xl,
    backgroundColor: 'transparent',
    borderBottomWidth: 1, borderBottomColor: theme.colors.border + '66',
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
  retireBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  retireBtnText: { color: theme.colors.error, fontSize: 13, fontWeight: '700' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 4 },
  editBtnText: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },

  // Retired list
  retiredRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 10,
    marginBottom: 6,
  },
  retiredText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  retiredKm: { color: theme.colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },

  // Section
  section: { marginBottom: 24, marginHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
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
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.18)',
  },
  emptyInjuryTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 10 },
  emptyInjurySub: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 4 },

  injuryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  severityChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  severityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  injuryDate: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },

  addInjuryCard: {
    padding: 14, marginTop: 8, gap: 8,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
});
