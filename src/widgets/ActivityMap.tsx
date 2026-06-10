import React, { memo, useMemo } from 'react';
import { Activity as ActivityGlyph } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

/**
 * 26-week activity heatmap. Days are bucketed via activityDayKey (one entry
 * per day, km summed — the old screen emitted one entry per activity and let
 * the calendar's Map dedupe arbitrarily); the day's type comes from its
 * longest activity.
 */
export const ActivityMapWidget = memo(function ActivityMapWidget() {
  const activities = useStore((s) => s.activities);

  const heatmapData = useMemo(() => {
    const byDay = new Map<string, { km: number; type: string; maxKm: number }>();
    for (const a of activities) {
      const day = activityDayKey(a);
      const km = a.distance / 1000;
      const cur = byDay.get(day);
      if (cur) {
        cur.km += km;
        if (km > cur.maxKm) {
          cur.maxKm = km;
          cur.type = a.type;
        }
      } else {
        byDay.set(day, { km, type: a.type, maxKm: km });
      }
    }
    return Array.from(byDay, ([date, v]) => {
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (v.km > 0) level = 1;
      if (v.km > 5) level = 2;
      if (v.km > 10) level = 3;
      if (v.km > 20) level = 4;
      return { date, level, type: v.type, km: v.km };
    });
  }, [activities]);

  return (
    <WidgetCard
      family={WIDGET_FAMILY.ActivityMap}
      title={WIDGET_TITLES.ActivityMap}
      icon={ActivityGlyph}
    >
      {heatmapData.length === 0 ? (
        <EmptyHint
          icon={ActivityGlyph}
          family={WIDGET_FAMILY.ActivityMap}
          text="No activity days yet — sync Strava to light up your heatmap."
        />
      ) : (
        <HeatmapCalendar data={heatmapData} />
      )}
    </WidgetCard>
  );
});
