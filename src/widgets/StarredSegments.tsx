import React, { memo, useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Star } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { decodePolyline } from '../utils/polyline';
import { useStore } from '../store/useStore';

const THUMB_W = 48;
const THUMB_H = 36;
const THUMB_PAD = 4;

interface SegmentRow {
  id: string | number;
  name: string;
  distanceKm: string;
  elevM: number;
  /** SVG path string for the route thumbnail, or null when no polyline. */
  thumbPath: string | null;
}

/** Decode + fit a segment polyline into the thumbnail box once, off-render. */
function buildThumbPath(encoded: string): string | null {
  const coords = encoded ? decodePolyline(encoded) : [];
  if (!coords.length) return null;
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }
  const latR = Math.max(maxLat - minLat, 1e-6);
  const lngR = Math.max(maxLng - minLng, 1e-6);
  const scale = Math.min((THUMB_W - 2 * THUMB_PAD) / lngR, (THUMB_H - 2 * THUMB_PAD) / latR);
  const xOff = (THUMB_W - lngR * scale) / 2;
  const yOff = (THUMB_H - latR * scale) / 2;
  let d = '';
  for (let j = 0; j < coords.length; j++) {
    const x = xOff + (coords[j].longitude - minLng) * scale;
    const y = yOff + (maxLat - coords[j].latitude) * scale;
    d += `${j === 0 ? 'M' : ' L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/**
 * Starred Strava segments with inline route thumbnails. Polylines are
 * decoded + projected ONCE in a memo keyed on the store slice — the old
 * inline widget redid the decode and bounding-box math on every render.
 */
export const StarredSegmentsWidget = memo(function StarredSegmentsWidget() {
  const starredSegments = useStore((s) => s.starredSegments);

  const rows = useMemo<SegmentRow[]>(() => {
    return (starredSegments || []).slice(0, 5).map((seg: any) => {
      const polyStr: string = seg?.map?.polyline || seg?.map?.summary_polyline || '';
      const elevSpan = (seg.elevation_high ?? 0) - (seg.elevation_low ?? 0);
      return {
        id: seg.id,
        name: seg.name,
        distanceKm: ((seg.distance || 0) / 1000).toFixed(2),
        elevM: Math.round(elevSpan || seg.total_elevation_gain || 0),
        thumbPath: buildThumbPath(polyStr),
      };
    });
  }, [starredSegments]);

  const accent = familyStyle('records').accent;

  return (
    <WidgetCard
      family={WIDGET_FAMILY['StarredSegments']}
      title={WIDGET_TITLES['StarredSegments']}
      icon={Star}
    >
      {rows.length === 0 ? (
        <EmptyHint
          icon={Star}
          family="records"
          text="Star segments on Strava and they'll show up here with route thumbnails."
        />
      ) : (
        rows.map((seg, i) => (
          <PressableScale
            key={seg.id}
            onPress={() =>
              Linking.openURL(`https://www.strava.com/segments/${seg.id}`).catch(() => {})
            }
            style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}
          >
            <View style={[styles.thumb, { borderColor: withAlpha(accent, 'strong') }]}>
              {seg.thumbPath ? (
                <Svg width={THUMB_W} height={THUMB_H}>
                  <Path d={seg.thumbPath} stroke={accent} strokeWidth={1.6} fill="none" />
                </Svg>
              ) : (
                <Star color={accent} size={16} />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Typography style={styles.name} numberOfLines={1}>
                {seg.name}
              </Typography>
              <Typography style={styles.sub}>
                {seg.distanceKm} km · {seg.elevM} m elev
              </Typography>
            </View>
          </PressableScale>
        ))
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  name: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    fontFamily: theme.fonts.semibold,
  },
  sub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
