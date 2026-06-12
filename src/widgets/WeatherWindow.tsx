import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LucideIcon,
  Sun,
  Umbrella,
} from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { localDateStr } from '../utils/dates';
import { bestWindow, refreshWeather, wmoIcon, WmoIconGroup } from '../services/weather';
import { useStore } from '../store/useStore';

const GROUP_ICONS: Record<WmoIconGroup, LucideIcon> = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const GROUP_LABELS: Record<WmoIconGroup, string> = {
  sun: 'Clear',
  cloud: 'Cloudy',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storms',
};

/**
 * Compact forecast card under TodayHero: current conditions near the last
 * activity start, today's best workout window, and a tomorrow one-liner.
 */
export const WeatherWindowWidget = memo(function WeatherWindowWidget() {
  const snap = useStore((s) => s.weatherCache);
  const hasGeoActivity = useStore((s) => s.activities.some((a) => a.startLatlng));
  const fam = familyStyle(WIDGET_FAMILY['WeatherWindow']);

  useEffect(() => {
    refreshWeather().catch(() => {});
  }, []);

  const todayKey = localDateStr(new Date());

  const derived = useMemo(() => {
    if (!snap) return null;
    const current = snap.hourly[0];
    if (!current) return null;
    const group = wmoIcon(current.code);
    const win = bestWindow(snap, todayKey);
    const rain = snap.hourly.find((h) => h.time.startsWith(todayKey) && h.precipProb >= 60);

    const tomorrow = snap.daily[1];
    let tomorrowLine: string | null = null;
    if (tomorrow) {
      tomorrowLine = `Tomorrow ${Math.round(tomorrow.tMinC)}–${Math.round(tomorrow.tMaxC)}°`;
      const tWin = bestWindow(snap, tomorrow.date);
      if (tWin) tomorrowLine += ` · best window ${tWin.label}`;
      if (tomorrow.precipProb >= 60) tomorrowLine += ` · ${Math.round(tomorrow.precipProb)}% rain`;
    }
    return { current, group, win, rain, tomorrowLine };
  }, [snap, todayKey]);

  return (
    <WidgetCard
      family={WIDGET_FAMILY['WeatherWindow']}
      title={WIDGET_TITLES['WeatherWindow']}
      icon={CloudSun}
      caption={derived ? 'near your last activity' : undefined}
    >
      {!derived ? (
        <EmptyHint
          icon={CloudSun}
          family="plan"
          text={hasGeoActivity
            ? 'Fetching your local forecast…'
            : 'Sync an activity to fetch your local forecast.'}
        />
      ) : (
        <View style={styles.body}>
          <View style={styles.nowRow}>
            <View style={[styles.iconBox, { backgroundColor: withAlpha(fam.accent, 'tint') }]}>
              {React.createElement(GROUP_ICONS[derived.group], { size: 16, color: fam.accent })}
            </View>
            <Typography style={styles.nowTemp}>{Math.round(derived.current.tempC)}°</Typography>
            <View style={styles.nowBody}>
              <Typography style={styles.nowLabel}>{GROUP_LABELS[derived.group]}</Typography>
              <Typography style={styles.nowSub}>
                feels {Math.round(derived.current.apparentC)}° · wind {Math.round(derived.current.windKph)} km/h
              </Typography>
            </View>
          </View>

          {derived.win && (
            <Typography style={[styles.windowLine, { color: fam.accent }]}>
              Best window today {derived.win.label} ({derived.win.tempC}°)
            </Typography>
          )}

          {derived.rain && (
            <View style={styles.rainRow}>
              <Umbrella size={12} color={theme.colors.warning} />
              <Typography style={styles.rainText}>
                Rain likely from {derived.rain.time.slice(11, 16)}
              </Typography>
            </View>
          )}

          {derived.tomorrowLine && (
            <Typography style={styles.tomorrowLine}>{derived.tomorrowLine}</Typography>
          )}
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  body: {
    gap: 8,
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowTemp: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  nowBody: {
    flex: 1,
  },
  nowLabel: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  nowSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  windowLine: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
  },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rainText: {
    ...theme.typography.micro,
    color: theme.colors.warning,
  },
  tomorrowLine: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
