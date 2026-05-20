import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { useStore } from '../store/useStore';
import { Plus, Activity, AlertCircle, Footprints, Heart } from 'lucide-react-native';
import { ProgressBar } from '../components/ProgressBar';

const SHOE_LIMIT_KM = 500;

export default function GearHealthScreen() {
  const { shoes, injuries, addShoe, addInjury, setToast } = useStore();
  const [shoeName, setShoeName] = useState('');
  const [shoeBrand, setShoeBrand] = useState('');
  const [injuryType, setInjuryType] = useState('');

  const handleAddShoe = () => {
    if (!shoeName || !shoeBrand) return;
    addShoe({ id: Date.now().toString(), name: shoeName, brand: shoeBrand, distance: 0 });
    setShoeName('');
    setShoeBrand('');
    setToast({ title: 'Success', message: 'Shoe added!', type: 'success' });
  };

  const handleAddInjury = () => {
    if (!injuryType) return;
    addInjury({ id: Date.now().toString(), type: injuryType, severity: 'Medium', date: new Date().toISOString() });
    setInjuryType('');
    setToast({ title: 'Logged', message: 'AI Coach will adjust plans.', type: 'success' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <LinearGradient
          colors={theme.colors.gradients.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroHeader}
        >
          <Typography style={styles.heroTitle}>Gear & Health</Typography>
          <Typography style={styles.heroSub}>Track shoe mileage and log injuries</Typography>
        </LinearGradient>

        {/* ── Shoes ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: theme.colors.primary }]} />
            <Footprints color={theme.colors.primary} size={16} />
            <Typography style={styles.sectionTitle}>Shoe Mileage</Typography>
          </View>

          {shoes.map((shoe, idx) => {
            const pct = Math.min((shoe.distance / SHOE_LIMIT_KM) * 100, 100);
            const overLimit = shoe.distance > SHOE_LIMIT_KM;
            const warning = shoe.distance > SHOE_LIMIT_KM * 0.8 && !overLimit;
            const color = overLimit ? theme.colors.error : warning ? '#f59e0b' : theme.colors.success;
            return (
              <Animated.View
                key={shoe.id}
                entering={FadeInDown.delay(idx * 60).duration(360)}
                layout={Layout.springify()}
              >
                <Card variant="elevated" style={styles.shoeCard}>
                  <View style={[styles.shoeAccent, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Typography style={styles.shoeBrand}>{shoe.brand}</Typography>
                    <Typography style={styles.shoeName}>{shoe.name}</Typography>
                    <View style={styles.shoeStatRow}>
                      <Typography style={[styles.shoeKm, { color }]}>{shoe.distance} km</Typography>
                      <Typography style={styles.shoeLimit}>/ {SHOE_LIMIT_KM} km</Typography>
                    </View>
                    <ProgressBar
                      progress={pct}
                      color={color}
                      height={6}
                      gradient={overLimit ? ['#ef4444', '#dc2626'] : warning ? ['#f59e0b', '#d97706'] : ['#10b981', '#059669']}
                    />
                    {overLimit && (
                      <View style={styles.warnRow}>
                        <AlertCircle size={11} color={theme.colors.error} />
                        <Typography style={styles.warnText}>Consider rotating to fresh shoes</Typography>
                      </View>
                    )}
                  </View>
                </Card>
              </Animated.View>
            );
          })}

          <Card variant="elevated" style={styles.addCard}>
            <TextInput
              style={styles.input}
              value={shoeBrand}
              onChangeText={setShoeBrand}
              placeholder="Brand (e.g. Nike)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TextInput
              style={styles.input}
              value={shoeName}
              onChangeText={setShoeName}
              placeholder="Model (e.g. Alphafly)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TouchableOpacity onPress={handleAddShoe} activeOpacity={0.85}>
              <LinearGradient
                colors={theme.colors.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.button, theme.shadows.glow(theme.colors.primary)]}
              >
                <Plus size={16} color="#fff" />
                <Typography style={styles.buttonText}>Add Shoe</Typography>
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        </View>

        {/* ── Injuries ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: theme.colors.error }]} />
            <Heart color={theme.colors.error} size={16} />
            <Typography style={styles.sectionTitle}>Injury Log</Typography>
          </View>

          {injuries.length === 0 ? (
            <View style={styles.emptyInjury}>
              <Activity color={theme.colors.success} size={28} />
              <Typography style={styles.emptyInjuryTitle}>No injuries logged</Typography>
              <Typography style={styles.emptyInjurySub}>Log any niggles so your AI coach can adjust load.</Typography>
            </View>
          ) : injuries.map((inj, idx) => (
            <Animated.View
              key={inj.id}
              entering={FadeInDown.delay(idx * 60).duration(360)}
              layout={Layout.springify()}
            >
              <Card variant="elevated" style={styles.injuryCard}>
                <View style={[styles.injuryAccent, { backgroundColor: theme.colors.error }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.injuryRow}>
                    <Typography style={styles.injuryType}>{inj.type}</Typography>
                    <View style={[styles.severityChip, { backgroundColor: theme.colors.error + '22' }]}>
                      <Typography style={[styles.severityText, { color: theme.colors.error }]}>{inj.severity}</Typography>
                    </View>
                  </View>
                  <Typography style={styles.injuryDate}>Logged: {new Date(inj.date).toLocaleDateString()}</Typography>
                </View>
              </Card>
            </Animated.View>
          ))}

          <Card variant="elevated" style={styles.addCard}>
            <TextInput
              style={styles.input}
              value={injuryType}
              onChangeText={setInjuryType}
              placeholder="Describe pain/injury (e.g. Right knee ache)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TouchableOpacity onPress={handleAddInjury} activeOpacity={0.85}>
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.button, theme.shadows.glow('#ef4444')]}
              >
                <AlertCircle size={16} color="#fff" />
                <Typography style={styles.buttonText}>Log Issue</Typography>
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        </View>

      </ScrollView>
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
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 22, marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },

  section: { marginBottom: 24, marginHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionAccent: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.3 },

  shoeCard: { flexDirection: 'row', padding: 14, marginBottom: 10, gap: 12 },
  shoeAccent: { width: 3, borderRadius: 2 },
  shoeBrand: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  shoeName: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 2, marginBottom: 8 },
  shoeStatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 8 },
  shoeKm: { fontSize: 22, fontWeight: '900' },
  shoeLimit: { fontSize: 12, color: theme.colors.textSecondary },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  warnText: { fontSize: 11, color: theme.colors.error, fontWeight: '600' },

  emptyInjury: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, paddingHorizontal: 24,
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.18)',
  },
  emptyInjuryTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 10 },
  emptyInjurySub: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 4 },

  injuryCard: { flexDirection: 'row', padding: 14, marginBottom: 10, gap: 12 },
  injuryAccent: { width: 3, borderRadius: 2 },
  injuryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  injuryType: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  severityChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  severityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  injuryDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 },

  addCard: { padding: 14, marginTop: 8, backgroundColor: theme.colors.surfaceMuted },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
    color: theme.colors.text,
    marginBottom: 8,
    fontSize: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
    gap: 6,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
