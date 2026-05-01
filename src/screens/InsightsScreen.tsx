import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Modal, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { useStore } from '../store/useStore';
import { format, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, subWeeks } from 'date-fns';
import { TrendingUp, Mountain, Heart, BarChart3, Zap, X, Activity, Settings2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W } = Dimensions.get('window');
// scroll padding 16*2 + card padding 16*2 + gifted-charts yAxis ~44 = 108
const CHART_W = SCREEN_W - 108;

type Tab = 'pace' | 'volume' | 'heart' | 'elevation' | 'steps' | 'time' | 'calories' | 'power';
const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'pace',      label: 'Pace'      },
  { key: 'volume',    label: 'Volume'    },
  { key: 'heart',     label: 'HR Zones'  },
  { key: 'elevation', label: 'Elevation' },
  { key: 'steps',     label: 'Steps'     },
  { key: 'time',      label: 'Time'      },
  { key: 'calories',  label: 'Calories'  },
  { key: 'power',     label: 'Power'     },
];

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Typography style={hdr.label}>{label}</Typography>
      {sub ? <Typography style={hdr.sub}>{sub}</Typography> : null}
    </View>
  );
}
const hdr = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  sub:   { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
});

export default function InsightsScreen() {
  const { activities, settings, updateSettings } = useStore();
  const activeKeys = settings.activeGraphs || ['pace', 'volume', 'heart', 'elevation'];
  const TABS = ALL_TABS.filter(t => activeKeys.includes(t.key));
  const [tab, setTab] = useState<Tab>(TABS.length > 0 ? TABS[0].key as Tab : 'pace');
  const [showManageModal, setShowManageModal] = useState(false);
  
  const toggleGraph = (key: Tab) => {
    let newKeys = [...activeKeys];
    if (newKeys.includes(key)) newKeys = newKeys.filter(k => k !== key);
    else newKeys.push(key);
    updateSettings({ activeGraphs: newKeys });
    if (tab === key && newKeys.length > 0) setTab(newKeys[0] as Tab);
  };


  const fmtPace = (v: number) => {
    const m = Math.floor(v); const s = Math.round((v - m) * 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Pace ──────────────────────────────────────────────────────────
  const paceData = useMemo(() => {
    return [...activities]
      .filter(a => a.type === 'Run' && a.averageSpeed > 0)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(-20)
      .map((act, i, arr) => {
        const minPerKm = 1000 / act.averageSpeed / 60;
        const isFirst  = i === 0;
        const isLast   = i === arr.length - 1;
        return {
          value: Number(minPerKm.toFixed(2)),
          // show label every 4th run + last
          labelComponent: (i % 4 === 0 || isLast) ? () => (
            <View style={{ width: 40, transform: [{ translateX: -10 }] }}>
              <Typography style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
                {format(parseISO(act.startDate), 'MMM d')}
              </Typography>
            </View>
          ) : undefined,
        };
      });
  }, [activities]);

  const bestPace = paceData.length ? Math.min(...paceData.map(d => d.value)) : 0;
  const avgPace  = paceData.length ? paceData.reduce((s, d) => s + d.value, 0) / paceData.length : 0;

  // ── Volume ────────────────────────────────────────────────────────
  const volumeData = useMemo(() => {
    const now   = new Date();
    const start = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7);
    const end   = endOfWeek(now, { weekStartsOn: 1 });
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).slice(-8).map((ws, i, arr) => {
      const we  = endOfWeek(ws, { weekStartsOn: 1 });
      const km  = activities
        .filter(a => { const d = parseISO(a.startDate); return d >= ws && d <= we; })
        .reduce((s, a) => s + a.distance / 1000, 0);
      // e.g. "Jan 5"
      const isLast = i === arr.length - 1;
      return { 
        value: Number(km.toFixed(1)), 
        labelComponent: (arr.length - 1 - i) % 2 === 0 ? () => (
          <View style={{ width: 45, transform: [{ translateX: -10 }] }}>
            <Typography style={{ color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>
              {format(ws, 'MMM d')}
            </Typography>
          </View>
        ) : undefined,
        frontColor: km > 0 ? theme.colors.primary : theme.colors.border 
      };
    });
  }, [activities]);

  const maxWeekVol = volumeData.length ? Math.max(...volumeData.map(d => d.value), 1) : 1;
  const totalVol   = volumeData.reduce((s, d) => s + d.value, 0).toFixed(0);
  const BAR_SPACING = Math.max(CHART_W / Math.max(volumeData.length * 2.2, 1), 10);
  const BAR_W       = Math.max(BAR_SPACING * 0.8, 12);

  // ── HR Zones ──────────────────────────────────────────────────────
  const { pieData, zoneStats } = useMemo(() => {
    let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
    activities.forEach(a => {
      const hr = a.averageHeartRate || 0;
      if (hr <= 0) return;
      if (hr < 115) z1++;
      else if (hr < 135) z2++;
      else if (hr < 155) z3++;
      else if (hr < 170) z4++;
      else z5++;
    });
    const total = z1 + z2 + z3 + z4 + z5;
    if (!total) return { pieData: [{ value: 1, color: theme.colors.border }], zoneStats: [] };
    const zones = [
      { label: 'Z1 Recovery',  value: z1, color: '#60A5FA' },
      { label: 'Z2 Aerobic',   value: z2, color: '#34D399' },
      { label: 'Z3 Tempo',     value: z3, color: '#FBBF24' },
      { label: 'Z4 Threshold', value: z4, color: '#F97316' },
      { label: 'Z5 Max',       value: z5, color: '#EF4444' },
    ].filter(z => z.value > 0);
    return {
      pieData:   zones.map(z => ({ value: z.value, color: z.color, text: `${Math.round(z.value / total * 100)}%` })),
      zoneStats: zones.map(z => ({ ...z, pct: Math.round(z.value / total * 100) })),
    };
  }, [activities]);

  // ── Elevation ─────────────────────────────────────────────────────
  const elevData = useMemo(() => {
    if (!activities.length) return [{ value: 0 }];
    return [...activities]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map(a => ({ value: a.totalElevationGain || 0 }));
  }, [activities]);

  const totalElev = Math.round(activities.reduce((s, a) => s + a.totalElevationGain, 0));
  const maxElev   = activities.length ? Math.max(...activities.map(a => a.totalElevationGain), 1) : 1;

  const elevBuckets = useMemo(() => {
    const defs = [
      { label: '0–50m',    min: 0,   max: 50   },
      { label: '50–200m',  min: 50,  max: 200  },
      { label: '200–500m', min: 200, max: 500  },
      { label: '500m+',    min: 500, max: Infinity },
    ];
    const maxC = Math.max(...defs.map(b => activities.filter(a => a.totalElevationGain >= b.min && a.totalElevationGain < b.max).length), 1);
    return defs.map(b => {
      const count = activities.filter(a => a.totalElevationGain >= b.min && a.totalElevationGain < b.max).length;
      return { 
        value: count, 
        labelComponent: () => (
          <View style={{ width: 60, transform: [{ translateX: -15 }] }}>
            <Typography style={{ color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>{b.label}</Typography>
          </View>
        ), 
        frontColor: '#FBBF24', 
        topLabelComponent: () => (
          <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginBottom: 2 }}>{count}</Typography>
        )
      };
    });
  }, [activities]);

  const ELEV_SPACING = Math.max((CHART_W - 40) / Math.max(elevBuckets.length * 2, 1), 8);

  // ── Steps ─────────────────────────────────────────────────────────
  const stepsData = useMemo(() => {
    const now   = new Date();
    const start = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7);
    const end   = endOfWeek(now, { weekStartsOn: 1 });
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).slice(-8).map((ws, i, arr) => {
      const we  = endOfWeek(ws, { weekStartsOn: 1 });
      const weekActs = activities.filter(a => { const d = parseISO(a.startDate); return d >= ws && d <= we; });
      let totalSteps = 0;
      weekActs.forEach(a => {
        if (a.steps) {
          totalSteps += a.steps;
        } else {
          if (a.type === 'Run') totalSteps += (a.distance / 1.0);
          else if (a.type === 'Walk') totalSteps += (a.distance / 0.75);
        }
      });
      return {
        value: Math.round(totalSteps),
        labelComponent: (arr.length - 1 - i) % 2 === 0 ? () => (
          <View style={{ width: 45, transform: [{ translateX: -10 }] }}>
            <Typography style={{ color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>
              {format(ws, 'MMM d')}
            </Typography>
          </View>
        ) : undefined,
        frontColor: totalSteps > 0 ? theme.colors.success : theme.colors.border
      };
    });
  }, [activities]);
  const maxSteps = stepsData.length ? Math.max(...stepsData.map(d => d.value), 1) : 1;
  const avgSteps = stepsData.length ? Math.round(stepsData.reduce((s,d) => s + d.value, 0) / stepsData.length) : 0;

  // ── Time ──────────────────────────────────────────────────────────
  const timeData = useMemo(() => {
    const now   = new Date();
    const start = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7);
    const end   = endOfWeek(now, { weekStartsOn: 1 });
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).slice(-8).map((ws, i, arr) => {
      const we  = endOfWeek(ws, { weekStartsOn: 1 });
      const hrs = activities
        .filter(a => { const d = parseISO(a.startDate); return d >= ws && d <= we; })
        .reduce((s, a) => s + (a.movingTime / 3600), 0);
      return {
        value: Number(hrs.toFixed(1)),
        labelComponent: (arr.length - 1 - i) % 2 === 0 ? () => (
          <View style={{ width: 45, transform: [{ translateX: -10 }] }}>
            <Typography style={{ color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>
              {format(ws, 'MMM d')}
            </Typography>
          </View>
        ) : undefined,
        frontColor: hrs > 0 ? '#8B5CF6' : theme.colors.border
      };
    });
  }, [activities]);
  const maxTime = timeData.length ? Math.max(...timeData.map(d => d.value), 1) : 1;
  const avgTime = timeData.length ? (timeData.reduce((s,d) => s + d.value, 0) / timeData.length).toFixed(1) : 0;

  // ── Calories ──────────────────────────────────────────────────────
  const caloriesData = useMemo(() => {
    const now   = new Date();
    const start = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7);
    const end   = endOfWeek(now, { weekStartsOn: 1 });
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).slice(-8).map((ws, i, arr) => {
      const we  = endOfWeek(ws, { weekStartsOn: 1 });
      const cals = activities
        .filter(a => { const d = parseISO(a.startDate); return d >= ws && d <= we; })
        .reduce((s, a) => s + (a.calories || 0), 0);
      return {
        value: Math.round(cals),
        labelComponent: (arr.length - 1 - i) % 2 === 0 ? () => (
          <View style={{ width: 45, transform: [{ translateX: -10 }] }}>
            <Typography style={{ color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>
              {format(ws, 'MMM d')}
            </Typography>
          </View>
        ) : undefined,
        frontColor: cals > 0 ? '#EF4444' : theme.colors.border
      };
    });
  }, [activities]);
  const maxCalories = caloriesData.length ? Math.max(...caloriesData.map(d => d.value), 1) : 1;
  const avgCalories = caloriesData.length ? Math.round(caloriesData.reduce((s,d) => s + d.value, 0) / caloriesData.length) : 0;

  // ── Power ─────────────────────────────────────────────────────────
  const powerData = useMemo(() => {
    return [...activities]
      .filter(a => a.averageWatts && a.averageWatts > 0)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(-20)
      .map((act, i, arr) => {
        const isLast = i === arr.length - 1;
        return {
          value: Math.round(act.averageWatts || 0),
          labelComponent: (i % 4 === 0 || isLast) ? () => (
            <View style={{ width: 40, transform: [{ translateX: -10 }] }}>
              <Typography style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
                {format(parseISO(act.startDate), 'MMM d')}
              </Typography>
            </View>
          ) : undefined,
        };
      });
  }, [activities]);
  const maxPower = powerData.length ? Math.max(...powerData.map(d => d.value), 1) : 1;
  const avgPower = powerData.length ? Math.round(powerData.reduce((s,d) => s + d.value, 0) / powerData.length) : 0;

  const ELEV_BAR_W   = Math.min(ELEV_SPACING * 1.5, 46);

  const getPointerConfig = (unit: string, color: string) => ({
    pointerStripHeight: 160,
    pointerStripColor: color,
    pointerStripWidth: 2,
    pointerColor: color,
    radius: 6,
    pointerLabelWidth: 80,
    pointerLabelHeight: 30,
    activatePointersOnLongPress: true,
    autoAdjustPointerLabelPosition: true,
    pointerLabelComponent: (items: any) => {
      if (!items || !items[0]) return null;
      const val = items[0].value;
      let formatted = val + unit;
      if (unit === '/km') {
        const n = parseFloat(val);
        const m = Math.floor(n);
        const s = Math.round((n - m) * 60);
        formatted = `${m}:${s.toString().padStart(2, '0')} /km`;
      }
      return (
        <View style={{
          height: 30, width: 80, backgroundColor: theme.colors.surface, 
          borderRadius: 8, justifyContent: 'center', alignItems: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
          borderWidth: 1, borderColor: theme.colors.border,
          marginTop: -30, marginLeft: -40
        }}>
          <Typography style={{ color: theme.colors.text, fontSize: 12, fontWeight: '800' }}>
            {formatted}
          </Typography>
        </View>
      );
    },
  });

  // shared chart config
  const chartBase = {
    yAxisColor: 'transparent' as const,
    xAxisColor: theme.colors.border,
    yAxisTextStyle: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '600' as const },
    xAxisLabelTextStyle: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700' as const },
    noOfSections: 4,
    rulesColor: theme.colors.border + '66',
    rulesType: 'dashed' as const,
    dashWidth: 4,
    dashGap: 4,
    isAnimated: true,
    animationDuration: 1000,
  };

  // Pace y-axis label formatter: 8.5 → "8:30"
  const paceYLabel = (v: string) => {
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    const m = Math.floor(n); const s = Math.round((n - m) * 60);
    return `${m}:${s.toString().padStart(2,'0')}`;
  };
  // Volume y-axis: "12" → "12km"
  const volYLabel  = (v: string) => `${parseFloat(v).toFixed(0)}km`;
  // Elevation y-axis: "100" → "100m"
  const elevYLabel = (v: string) => `${parseFloat(v).toFixed(0)}m`;

  const TAB_COLORS: Record<Tab, [string, string]> = {
    pace:      ['#6366f1', '#8b5cf6'],
    volume:    ['#0ea5e9', '#0284c7'],
    heart:     ['#ef4444', '#dc2626'],
    elevation: ['#f59e0b', '#d97706'],
    steps:     ['#10b981', '#059669'],
    time:      ['#8b5cf6', '#7c3aed'],
    calories:  ['#ef4444', '#dc2626'],
    power:     ['#f97316', '#ea580c'],
  };
  const activeColor = TAB_COLORS[tab] ?? ['#6366f1', '#8b5cf6'];

  const SummaryPill = ({ label, value, unit, gradColors }: { label: string; value: string | number; unit?: string; gradColors?: [string, string] }) => (
    <LinearGradient
      colors={gradColors ?? activeColor}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={st.pill}
    >
      <Typography style={st.pillLabel}>{label}</Typography>
      <Typography style={st.pillValue}>
        {value}{unit ? <Typography style={st.pillUnit}> {unit}</Typography> : null}
      </Typography>
    </LinearGradient>
  );

  const Tooltip = ({ text }: { text: string }) => (
    <View style={st.tooltip}><Typography style={st.tooltipText}>{text}</Typography></View>
  );

  const EmptyChart = ({ msg }: { msg: string }) => (
    <View style={st.emptyChart}><Typography style={st.emptyText}>{msg}</Typography></View>
  );

  return (
    <SafeAreaView style={st.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

        <Typography style={st.pageTitle}>Insights</Typography>

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const tColors = TAB_COLORS[t.key] ?? ['#6366f1', '#8b5cf6'];
            return active ? (
              <LinearGradient key={t.key} colors={tColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[st.tab, { flex: 0, paddingHorizontal: 18 }]}>
                <Typography style={[st.tabText, st.tabTextActive]}>{t.label}</Typography>
              </LinearGradient>
            ) : (
              <TouchableOpacity key={t.key} style={[st.tab, { flex: 0, paddingHorizontal: 18, backgroundColor: theme.colors.surface }]} onPress={() => setTab(t.key)} activeOpacity={0.7}>
                <Typography style={st.tabText}>{t.label}</Typography>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={[st.tab, { flex: 0, paddingHorizontal: 16, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.primary }]} onPress={() => setShowManageModal(true)}>
            <Settings2 size={12} color={theme.colors.primary} />
            <Typography style={[st.tabText, { color: theme.colors.primary, marginLeft: 4 }]}>Manage</Typography>
          </TouchableOpacity>
        </ScrollView>

        {/* ════ PACE ════ */}
        {tab === 'pace' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="Best"    value={bestPace ? fmtPace(bestPace) : '--'} unit="/km" />
              <SummaryPill label="Average" value={avgPace  ? fmtPace(avgPace)  : '--'} unit="/km" gradColors={['#8b5cf6','#7c3aed']} />
              <SummaryPill label="Runs"    value={paceData.length} gradColors={['#0ea5e9','#0284c7']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#6366f1' }]}>
              {paceData.length > 1 ? (
                <View style={{ overflow: 'hidden' }}>
                  <LineChart
                    data={paceData}
                    height={200} width={CHART_W}
                    thickness={4}
                    color={theme.colors.primary}
                    hideDataPoints
                    maxValue={Math.ceil(Math.max(...paceData.map(d => d.value)) * 1.15)}
                    initialSpacing={12}
                    spacing={Math.max((CHART_W - 12) / Math.max(paceData.length - 1, 1), 18)}
                    curved areaChart
                    startFillColor={theme.colors.primary} endFillColor={theme.colors.background}
                    startOpacity={0.6} endOpacity={0}
                    yAxisLabelTexts={Array.from({ length: 5 }, (_, i) => {
                      const max = Math.ceil(Math.max(...paceData.map(d => d.value)) * 1.15);
                      const min = Math.floor(Math.min(...paceData.map(d => d.value)) * 0.9);
                      const v = min + (max - min) * i / 4;
                      return paceYLabel(v.toFixed(2));
                    })}
                    pointerConfig={getPointerConfig('/km', theme.colors.primary)}
                    {...chartBase}
                  />
                </View>
              ) : <EmptyChart msg="Sync Strava runs to see your pace trend" />}
            </Card>
          </Animated.View>
        )}

        {/* ════ VOLUME ════ */}
        {tab === 'volume' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="8-week total" value={totalVol}              unit="km" />
              <SummaryPill label="Peak week"    value={maxWeekVol.toFixed(1)} unit="km" gradColors={['#f59e0b','#d97706']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#0ea5e9' }]}>
              {volumeData.length > 0 ? (
                <View style={{ overflow: 'hidden' }}>
                  <BarChart
                    data={volumeData}
                    height={200} width={CHART_W}
                    barWidth={BAR_W}
                    roundedTop
                    roundedBottom={false}
                    maxValue={Math.ceil(maxWeekVol * 1.3)}
                    initialSpacing={BAR_SPACING / 2}
                    spacing={BAR_SPACING}
                    showGradient
                    gradientColor={theme.colors.primary}
                    frontColor={theme.colors.primary + '55'}
                    pointerConfig={getPointerConfig(' km', theme.colors.primary)}
                    {...chartBase}
                  />
                </View>
              ) : <EmptyChart msg="No activity data yet" />}
            </Card>
          </Animated.View>
        )}

        {/* ════ HEART RATE ════ */}
        {tab === 'heart' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#ef4444' }]}>
              <SectionHeader label="HR Zone Distribution" sub="Based on average HR per activity" />
              {zoneStats.length > 0 ? (
                <>
                  <View style={{ alignItems: 'center', marginVertical: 16 }}>
                    <PieChart
                      data={pieData} donut showText textColor="#fff"
                      radius={110} innerRadius={65} textSize={11}
                      isAnimated animationDuration={800}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Heart color="#EF4444" size={20} />
                          <Typography style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 2 }}>zones</Typography>
                        </View>
                      )}
                    />
                  </View>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {zoneStats.map(z => (
                      <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: z.color }} />
                        <View style={{ flex: 1 }}>
                          <Typography style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 3 }}>{z.label}</Typography>
                          <View style={{ height: 5, backgroundColor: theme.colors.background, borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${z.pct}%`, backgroundColor: z.color, borderRadius: 3 }} />
                          </View>
                        </View>
                        <Typography style={{ fontSize: 12, fontWeight: '700', color: z.color, width: 36, textAlign: 'right' }}>{z.pct}%</Typography>
                      </View>
                    ))}
                  </View>
                </>
              ) : <EmptyChart msg="No heart rate data. Enable HR recording on Strava." />}
            </Card>
            {zoneStats.length > 0 && (
              <Card style={[st.chartCard, { borderLeftWidth: 3, borderLeftColor: '#FBBF24', backgroundColor: '#FBBF2411' }]}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Zap color="#FBBF24" size={16} />
                  <View style={{ flex: 1 }}>
                    <Typography style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}>80/20 Training Rule</Typography>
                    <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 }}>
                      Elite runners spend ~80% in Z1–Z2 (easy) and ~20% in Z3–Z5 (hard).
                      {(() => { const ez = (zoneStats.find(z => z.label.includes('Z1'))?.pct || 0) + (zoneStats.find(z => z.label.includes('Z2'))?.pct || 0); return ez ? ` You're at ${ez}% easy effort.` : ''; })()}
                    </Typography>
                  </View>
                </View>
              </Card>
            )}
          </Animated.View>
        )}

        {/* ════ ELEVATION ════ */}
        {tab === 'elevation' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="Total climbed" value={totalElev.toLocaleString()} unit="m" />
              <SummaryPill label="Peak single"   value={Math.round(maxElev)}         unit="m" gradColors={['#f59e0b','#d97706']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#f59e0b' }]}>
              <SectionHeader label="Elevation per Activity" sub="Total gain (m)" />
              {elevData.length > 1 ? (
                <View style={{ overflow: 'hidden' }}>
                  <LineChart
                    data={elevData}
                    height={200} width={CHART_W}
                    thickness={4} color="#FBBF24" hideDataPoints
                    initialSpacing={0}
                    spacing={Math.max(CHART_W / Math.max(elevData.length - 1, 1), 4)}
                    curved areaChart
                    startFillColor="#FBBF24" endFillColor={theme.colors.background}
                    startOpacity={0.6} endOpacity={0}
                    yAxisLabelSuffix=" m"
                    pointerConfig={getPointerConfig('m', '#FBBF24')}
                    {...chartBase}
                  />
                </View>
              ) : <EmptyChart msg="No elevation data yet" />}
            </Card>
            <Card style={st.chartCard}>
              <SectionHeader label="Elevation Buckets" sub="Activities by gain" />
              <View style={{ overflow: 'hidden' }}>
                <BarChart
                  data={elevBuckets}
                  height={150} width={CHART_W}
                  barWidth={ELEV_BAR_W}
                  roundedTop
                  maxValue={Math.ceil(Math.max(...elevBuckets.map(b => b.value), 1) * 1.3)}
                  initialSpacing={ELEV_SPACING}
                  spacing={ELEV_SPACING}
                  showGradient gradientColor="#FBBF2444"
                  frontColor="#FBBF24"
                  {...chartBase}
                />
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ════ STEPS ════ */}
        {tab === 'steps' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="Avg Steps/Wk" value={avgSteps} gradColors={['#10b981','#059669']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#10b981' }]}>
              <SectionHeader label="Estimated Steps" sub="Last 8 weeks" />
              <View style={{ overflow: 'hidden' }}>
                <BarChart
                  data={stepsData}
                  height={200} width={CHART_W}
                  barWidth={BAR_W} roundedTop
                  maxValue={Math.ceil(maxSteps * 1.2)}
                  initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                  yAxisLabelTexts={Array.from({length: 5}, (_, i) => Math.round(maxSteps * 1.2 * i / 4 / 1000) + 'k')}
                  {...chartBase}
                />
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ════ TIME ════ */}
        {tab === 'time' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="Avg Active Time" value={avgTime} unit="hrs/wk" gradColors={['#8b5cf6','#7c3aed']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#8b5cf6' }]}>
              <SectionHeader label="Active Time" sub="Last 8 weeks (hrs)" />
              <View style={{ overflow: 'hidden' }}>
                <BarChart
                  data={timeData}
                  height={200} width={CHART_W}
                  barWidth={BAR_W} roundedTop
                  maxValue={Math.ceil(maxTime * 1.2)}
                  initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                  {...chartBase}
                />
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ════ CALORIES ════ */}
        {tab === 'calories' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="Avg Calories/Wk" value={avgCalories} gradColors={['#ef4444','#dc2626']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#ef4444' }]}>
              <SectionHeader label="Calories Burned" sub="Last 8 weeks (kcal)" />
              <View style={{ overflow: 'hidden' }}>
                <BarChart
                  data={caloriesData}
                  height={200} width={CHART_W}
                  barWidth={BAR_W} roundedTop
                  maxValue={Math.ceil(maxCalories * 1.2)}
                  initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                  {...chartBase}
                />
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ════ POWER ════ */}
        {tab === 'power' && (
          <Animated.View entering={FadeInDown.duration(400)} layout={Layout.springify()}>
            <View style={st.pillRow}>
              <SummaryPill label="Avg Power" value={avgPower} unit="W" gradColors={['#f97316','#ea580c']} />
            </View>
            <Card style={[st.chartCard, { borderTopWidth: 3, borderTopColor: '#f97316' }]}>
              <SectionHeader label="Average Power" sub="Last 20 activities with power" />
              {powerData.length > 1 ? (
                <View style={{ overflow: 'hidden' }}>
                  <LineChart
                    data={powerData}
                    height={200} width={CHART_W}
                    thickness={4} color={theme.colors.accent} hideDataPoints
                    initialSpacing={12}
                    spacing={Math.max((CHART_W - 12) / Math.max(powerData.length - 1, 1), 18)}
                    curved areaChart
                    startFillColor={theme.colors.accent} endFillColor={theme.colors.background}
                    startOpacity={0.6} endOpacity={0}
                    yAxisLabelSuffix=" W"
                    pointerConfig={getPointerConfig('W', theme.colors.accent)}
                    {...chartBase}
                  />
                </View>
              ) : <EmptyChart msg="No power data available" />}
            </Card>
          </Animated.View>
        )}

      </ScrollView>

      {/* MANAGE GRAPHS MODAL */}
      <Modal animationType="slide" transparent visible={showManageModal} onRequestClose={() => setShowManageModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.surface, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              <Typography variant="h2">Manage Graphs</Typography>
              <TouchableOpacity onPress={() => setShowManageModal(false)}><X color={theme.colors.textSecondary} /></TouchableOpacity>
            </View>
            {ALL_TABS.map(t => (
              <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Typography>{t.label}</Typography>
                <Switch 
                  value={activeKeys.includes(t.key)}
                  onValueChange={() => toggleGraph(t.key)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>
            ))}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll:    { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },

  tabRow: {
    flexDirection: 'row', backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md, padding: 4, marginBottom: 20,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive:    { backgroundColor: theme.colors.primary },
  tabText:      { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive:{ color: '#fff' },

  pillRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill:      { flex: 1, borderRadius: theme.borderRadius.md, padding: 14, overflow: 'hidden' },
  pillLabel: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pillValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
  pillUnit:  { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '400' },

  chartCard: { padding: 16, marginBottom: 16 },

  emptyChart: { height: 120, alignItems: 'center', justifyContent: 'center' },
  emptyText:  { color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center' },

  tooltip:     { marginTop: 10, backgroundColor: theme.colors.primary + '22', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary + '55' },
  tooltipText: { fontSize: 12, color: theme.colors.primary, fontWeight: '700' },
});
