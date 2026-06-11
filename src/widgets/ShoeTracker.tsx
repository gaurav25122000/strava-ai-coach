import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Footprints } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { DonutRing } from '../components/DonutRing';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

// Default shoe lifespan when the pair has no per-shoe lifespan set.
const SHOE_LIFESPAN_KM = 600;
// Past this share of the lifespan the ring switches to the warning palette.
const WEAR_WARN_RATIO = 0.8;

export const ShoeTrackerWidget = memo(function ShoeTrackerWidget() {
  const shoes = useStore((s) => s.shoes);
  const navigation = useNavigation<any>();

  const topShoes = useMemo(
    () => [...shoes].sort((a, b) => b.distance - a.distance).slice(0, 3),
    [shoes],
  );

  return (
    <WidgetCard
      family={WIDGET_FAMILY.ShoeTracker}
      title={WIDGET_TITLES.ShoeTracker}
      icon={Footprints}
      onPress={() => navigation.navigate('Menu', { screen: 'GearHealth', initial: false })}
    >
      {topShoes.length === 0 ? (
        <EmptyHint
          icon={Footprints}
          family={WIDGET_FAMILY.ShoeTracker}
          text="No shoes tracked yet — add your gear in Gear & Health to watch mileage and wear."
        />
      ) : (
        topShoes.map((shoe) => {
          const lifespanKm = shoe.lifespanKm ?? SHOE_LIFESPAN_KM;
          const pct = Math.min(shoe.distance / lifespanKm, 1);
          const isWarn = pct >= WEAR_WARN_RATIO;
          const ringColor = isWarn ? theme.colors.error : familyStyle('activity').accent;
          return (
            <View key={shoe.id} style={styles.shoeRow}>
              <View style={styles.shoeIconWrap}>
                <Footprints color={ringColor} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Typography style={styles.shoeName} numberOfLines={1}>
                  {shoe.name}
                </Typography>
                {shoe.brand ? (
                  <Typography style={styles.shoeBrand} numberOfLines={1}>
                    {shoe.brand}
                  </Typography>
                ) : null}
                <Typography style={styles.shoeMileage}>
                  {Math.round(shoe.distance)} / {lifespanKm} km
                </Typography>
              </View>
              <DonutRing
                size={54}
                stroke={6}
                progress={pct}
                color={ringColor}
                gradient={isWarn ? theme.colors.gradients.danger : familyStyle('activity').gradient}
                trackColor={theme.colors.background}
              >
                <Typography style={styles.shoeRingPct}>{Math.round(pct * 100)}</Typography>
                <Typography style={styles.shoeRingLbl}>%</Typography>
              </DonutRing>
            </View>
          );
        })
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  shoeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  shoeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    marginRight: 12,
  },
  shoeName: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  shoeBrand: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 1 },
  shoeMileage: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 4 },
  shoeRingPct: { fontSize: 13, fontWeight: '900', color: theme.colors.text, lineHeight: 14, letterSpacing: -0.3 },
  shoeRingLbl: { fontSize: 8, color: theme.colors.textSecondary, fontWeight: '700' },
});
