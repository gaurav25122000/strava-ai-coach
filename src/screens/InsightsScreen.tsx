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
import { Heart, BarChart3, Zap, X, Activity, Settings2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W } = Dimensions.get('window');
// scroll padding 16*2 + card padding 16*2 + gifted-charts yAxis ~44 = 108
const CHART_W = SCREEN_W - 108;

type Tab = 'pace' | 'volume' | 'heart' | 'elevation' | 'steps' | 'time' | 'calories' | 'power' | 'cadence' | 'mix';
const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'steps',     label: 'Steps'     },
  { key: 'time',      label: 'Time'      },
  { key: 'volume',    label: 'Volume'    },
  { key: 'pace',      label: 'Pace'      },
  { key: 'heart',     label: 'HR Zones'  },
  { key: 'cadence',   label: 'Cadence'   },
  { key: 'mix',       label: 'Activity Mix' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'calories',  label: 'Calories'  },
  { key: 'power',     label: 'Power'     },
];



export default function InsightsScreen() {
  const { activities, settings, updateSettings, hrZones } = useStore();
  const activeKeys = settings.activeGraphs || ['steps', 'time', 'volume', 'pace', 'heart'];
  const [showManageModal, setShowManageModal] = useState(false);

  const toggleGraph = (key: Tab) => {
    let newKeys = [...activeKeys];
    if (newKeys.includes(key)) newKeys = newKeys.filter(k => k !== key);
    else newKeys.push(key);
    updateSettings({ activeGraphs: newKeys });
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
    // Use Strava zones if available, else fallback thresholds
    const boundaries: number[] = hrZones.length >= 5
      ? hrZones.map(z => z.min)
      : [0, 115, 135, 155, 170];

    const counts = [0, 0, 0, 0, 0];
    activities.forEach(a => {
      const hr = a.averageHeartRate || 0;
      if (hr <= 0) return;
      // Find highest zone whose min <= hr
      let z = 0;
      for (let i = 0; i < boundaries.length; i++) {
        if (hr >= boundaries[i]) z = i;
      }
      counts[z]++;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) return { pieData: [{ value: 1, color: theme.colors.border }], zoneStats: [] };
    const ZONE_DEFS = [
      { label: 'Z1 Recovery',  color: '#60A5FA' },
      { label: 'Z2 Aerobic',   color: '#34D399' },
      { label: 'Z3 Tempo',     color: '#FBBF24' },
      { label: 'Z4 Threshold', color: '#F97316' },
      { label: 'Z5 Max',       color: '#EF4444' },
    ];
    const zones = ZONE_DEFS.map((d, i) => ({ ...d, value: counts[i] })).filter(z => z.value > 0);
    return {
      pieData:   zones.map(z => ({ value: z.value, color: z.color, text: `${Math.round(z.value / total * 100)}%` })),
      zoneStats: zones.map(z => ({ ...z, pct: Math.round(z.value / total * 100) })),
    };
  }, [activities, hrZones]);

  // ── Elevation ─────────────────────────────────────────────────────
  const elevData = useMemo(() => {
    if (!activities.length) return [{ value: 0 }];
    return [...activities]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map(a => ({ value: a.totalElevationGain || 0 }));
  }, [activities]);

  const totalElev = Math.round(activities.reduce((s, a) => s + a.totalElevationGain, 0));
  const maxElev   = activities.length ? Math.max(...activities.map(a => a.totalElevationGain), 1) : 1;



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

  // ── Cadence ───────────────────────────────────────────────────────
  const cadenceData = useMemo(() => {
    return [...activities]
      .filter(a => (a.averageCadence || 0) > 0)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(-20)
      .map((act, i, arr) => ({
        value: Math.round((act.averageCadence || 0) * 2), // steps per min (Strava stores as one-leg)
        labelComponent: (i % 4 === 0 || i === arr.length - 1) ? () => (
          <View style={{ width: 40, transform: [{ translateX: -10 }] }}>
            <Typography style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
              {format(parseISO(act.startDate), 'MMM d')}
            </Typography>
          </View>
        ) : undefined,
      }));
  }, [activities]);
  const avgCadence = cadenceData.length ? Math.round(cadenceData.reduce((s, d) => s + d.value, 0) / cadenceData.length) : 0;
  const maxCadence = cadenceData.length ? Math.max(...cadenceData.map(d => d.value), 1) : 200;

  // ── Activity Mix ──────────────────────────────────────────────────
  const { mixPieData, mixStats } = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
    const palette: Record<string, string> = { Run: '#f97316', Walk: '#10b981', Ride: '#6366f1', Workout: '#ec4899' };
    const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
    const entries = Object.entries(counts).map(([type, count]) => ({
      type, count, color: palette[type] || '#8b5cf6',
      pct: Math.round(count / total * 100),
    }));
    return {
      mixPieData: entries.map(e => ({ value: e.count, color: e.color, text: `${e.pct}%` })),
      mixStats: entries,
    };
  }, [activities]);



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


  const CARD_COLORS: Record<Tab, [string, string]> = {
    steps:     ['#10b981', '#059669'],
    time:      ['#8b5cf6', '#7c3aed'],
    volume:    ['#0ea5e9', '#0284c7'],
    pace:      ['#6366f1', '#8b5cf6'],
    heart:     ['#ef4444', '#dc2626'],
    cadence:   ['#ec4899', '#db2777'],
    mix:       ['#6366f1', '#8b5cf6'],
    elevation: ['#f59e0b', '#d97706'],
    calories:  ['#ef4444', '#dc2626'],
    power:     ['#f97316', '#ea580c'],
  };

  const EmptyChart = ({ msg }: { msg: string }) => (
    <View style={st.emptyChart}><Typography style={st.emptyText}>{msg}</Typography></View>
  );

  const Insight = ({ text, color }: { text: string; color: string }) => (
    <View style={[st.insightBar, { borderLeftColor: color, backgroundColor: color + '18' }]}>
      <Zap size={12} color={color} />
      <Typography style={[st.insightText, { color }]}>{text}</Typography>
    </View>
  );

  // Card header with gradient accent + stat chip
  const CardHeader = ({ title, sub, colors, stat, statUnit }: {
    title: string; sub: string; colors: [string, string]; stat?: string | number; statUnit?: string;
  }) => (
    <View style={st.cardHeader}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.cardAccent} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Typography style={st.cardTitle}>{title}</Typography>
        <Typography style={st.cardSub}>{sub}</Typography>
      </View>
      {stat !== undefined && (
        <View style={[st.statChip, { borderColor: colors[0] + '55', backgroundColor: colors[0] + '18' }]}>
          <Typography style={[st.statChipVal, { color: colors[0] }]}>{stat}</Typography>
          {statUnit && <Typography style={[st.statChipUnit, { color: colors[0] }]}>{statUnit}</Typography>}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <View>
          <Typography style={st.pageTitle}>Insights</Typography>
          <Typography style={st.pageSub}>{activities.length} activities analysed</Typography>
        </View>
        <TouchableOpacity style={st.manageBtn} onPress={() => setShowManageModal(true)}>
          <Settings2 size={13} color={theme.colors.primary} />
          <Typography style={st.manageBtnText}>Manage</Typography>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

        {/* Active graph cards — vertical feed */}
        {ALL_TABS.filter(t => activeKeys.includes(t.key)).map((t, idx) => {
          const C = CARD_COLORS[t.key] ?? ['#6366f1', '#8b5cf6'];
          return (
            <Animated.View key={t.key} entering={FadeInDown.delay(idx * 80).duration(400)} layout={Layout.springify()}>
              <Card style={st.card}>

                {/* ── STEPS ── */}
                {t.key === 'steps' && (
                  <>
                    <CardHeader title="Weekly Steps" sub="Estimated from run &amp; walk distance" colors={C}
                      stat={avgSteps > 0 ? `${Math.round(avgSteps / 1000)}k` : '--'} statUnit="avg/wk" />
                    <View style={{ overflow: 'hidden', marginTop: 12 }}>
                      <BarChart data={stepsData} height={180} width={CHART_W} barWidth={BAR_W} roundedTop
                        maxValue={Math.ceil(stepsData.reduce((m,d)=>Math.max(m,d.value),1) * 1.25)}
                        initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                        yAxisLabelTexts={Array.from({length:5},(_,i)=>Math.round(stepsData.reduce((m,d)=>Math.max(m,d.value),1)*1.25*i/4/1000)+'k')}
                        {...chartBase} />
                    </View>
                    {avgSteps > 0 && <Insight color={C[0]} text={`${Math.round(avgSteps).toLocaleString()} avg steps/week — 10,000/day target = 70,000/week`} />}
                  </>
                )}

                {/* ── TIME ── */}
                {t.key === 'time' && (
                  <>
                    <CardHeader title="Active Time" sub="Hours of movement per week" colors={C}
                      stat={avgTime} statUnit="hrs/wk" />
                    <View style={{ overflow: 'hidden', marginTop: 12 }}>
                      <BarChart data={timeData} height={180} width={CHART_W} barWidth={BAR_W} roundedTop
                        maxValue={Math.ceil(Math.max(...timeData.map(d=>d.value),1) * 1.3)}
                        initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                        {...chartBase} />
                    </View>
                    {Number(avgTime) > 0 && <Insight color={C[0]} text={`${avgTime} hrs/wk avg — WHO recommends 2.5 hrs moderate activity weekly`} />}
                  </>
                )}

                {/* ── VOLUME ── */}
                {t.key === 'volume' && (
                  <>
                    <CardHeader title="Weekly Volume" sub="Kilometres across all activities" colors={C}
                      stat={maxWeekVol.toFixed(0)} statUnit="km peak" />
                    {volumeData.some(d=>d.value>0) ? (
                      <View style={{ overflow: 'hidden', marginTop: 12 }}>
                        <BarChart data={volumeData} height={180} width={CHART_W} barWidth={BAR_W} roundedTop
                          maxValue={Math.ceil(maxWeekVol * 1.35)}
                          initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                          showGradient gradientColor={C[0]} frontColor={C[0] + '55'}
                          pointerConfig={getPointerConfig(' km', C[0])}
                          {...chartBase} />
                      </View>
                    ) : <EmptyChart msg="No activity data yet" />}
                    <Insight color={C[0]} text={`${totalVol} km total in last 8 weeks. Increase no more than 10%/week to avoid injury.`} />
                  </>
                )}

                {/* ── PACE ── */}
                {t.key === 'pace' && (
                  <>
                    <CardHeader title="Running Pace" sub="Min/km trend over last 20 runs" colors={C}
                      stat={bestPace ? fmtPace(bestPace) : '--'} statUnit="/km best" />
                    {paceData.length > 1 ? (
                      <View style={{ overflow: 'hidden', marginTop: 12 }}>
                        <LineChart data={paceData} height={180} width={CHART_W} thickness={3} color={C[0]}
                          hideDataPoints curved areaChart
                          maxValue={Math.ceil(Math.max(...paceData.map(d=>d.value)) * 1.15)}
                          initialSpacing={12}
                          spacing={Math.max((CHART_W-12)/Math.max(paceData.length-1,1),18)}
                          startFillColor={C[0]} endFillColor={theme.colors.background}
                          startOpacity={0.5} endOpacity={0}
                          yAxisLabelTexts={Array.from({length:5},(_,i)=>{const mx=Math.ceil(Math.max(...paceData.map(d=>d.value))*1.15);const mn=Math.floor(Math.min(...paceData.map(d=>d.value))*0.9);return paceYLabel((mn+(mx-mn)*i/4).toFixed(2));})}
                          pointerConfig={getPointerConfig('/km', C[0])}
                          {...chartBase} />
                      </View>
                    ) : <EmptyChart msg="Sync Strava runs to see pace trend" />}
                    {avgPace > 0 && <Insight color={C[0]} text={`Avg ${fmtPace(avgPace)}/km · Best ${bestPace ? fmtPace(bestPace) : '--'}/km · ${paceData.length} runs`} />}
                  </>
                )}

                {/* ── HR ZONES ── */}
                {t.key === 'heart' && (
                  <>
                    <CardHeader title="HR Zone Distribution" sub="Where you spend your effort" colors={C} />
                    {zoneStats.length > 0 ? (
                      <>
                        <View style={{ alignItems: 'center', marginVertical: 16 }}>
                          <PieChart data={pieData} donut showText textColor="#fff"
                            radius={100} innerRadius={60} textSize={11}
                            isAnimated animationDuration={800}
                            centerLabelComponent={() => (
                              <View style={{ alignItems: 'center' }}>
                                <Heart color="#EF4444" size={18} />
                                <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 2 }}>zones</Typography>
                              </View>
                            )} />
                        </View>
                        <View style={{ gap: 8 }}>
                          {zoneStats.map((z, i) => {
                            const boundaries: number[] = hrZones.length >= 5
                              ? hrZones.map(hz => hz.min)
                              : [0, 115, 135, 155, 170];
                            const maxBounds = hrZones.length >= 5
                              ? hrZones.map((hz, j) => hrZones[j + 1] ? hrZones[j + 1].min - 1 : 999)
                              : [114, 134, 154, 169, 999];
                            const zoneIdx = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].findIndex(zl => z.label.includes(zl));
                            const bpmRange = zoneIdx >= 0
                              ? (maxBounds[zoneIdx] < 999 ? `${boundaries[zoneIdx]}–${maxBounds[zoneIdx]} bpm` : `${boundaries[zoneIdx]}+ bpm`)
                              : '';
                            return (
                              <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: z.color }} />
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                    <Typography style={{ fontSize: 11, color: theme.colors.text, fontWeight: '600' }}>{z.label}</Typography>
                                    <Typography style={{ fontSize: 10, color: theme.colors.textSecondary }}>({bpmRange})</Typography>
                                  </View>
                                  <View style={{ height: 5, backgroundColor: theme.colors.background, borderRadius: 3, overflow: 'hidden' }}>
                                    <View style={{ height: '100%', width: `${z.pct}%`, backgroundColor: z.color, borderRadius: 3 }} />
                                  </View>
                                </View>
                                <Typography style={{ fontSize: 12, fontWeight: '700', color: z.color, width: 36, textAlign: 'right' }}>{z.pct}%</Typography>
                              </View>
                            );
                          })}
                        </View>
                        {(() => { const ez=(zoneStats.find(z=>z.label.includes('Z1'))?.pct||0)+(zoneStats.find(z=>z.label.includes('Z2'))?.pct||0); return <Insight color="#ef4444" text={`${ez}% easy effort. Elite runners target 80% in Z1–Z2 for aerobic base building.`} />; })()}
                      </>
                    ) : <EmptyChart msg="No HR data. Enable heart rate recording on Strava." />}
                  </>
                )}

                {/* ── CADENCE ── */}
                {t.key === 'cadence' && (
                  <>
                    <CardHeader title="Running Cadence" sub="Steps per minute over last 20 runs" colors={C}
                      stat={avgCadence || '--'} statUnit="spm avg" />
                    {cadenceData.length > 1 ? (
                      <View style={{ overflow: 'hidden', marginTop: 12 }}>
                        <LineChart data={cadenceData} height={180} width={CHART_W} thickness={3} color={C[0]}
                          hideDataPoints curved areaChart
                          maxValue={Math.max(maxCadence + 10, 200)}
                          initialSpacing={12}
                          spacing={Math.max((CHART_W-12)/Math.max(cadenceData.length-1,1),18)}
                          startFillColor={C[0]} endFillColor={theme.colors.background}
                          startOpacity={0.5} endOpacity={0}
                          yAxisLabelSuffix=" spm"
                          pointerConfig={getPointerConfig(' spm', C[0])}
                          {...chartBase} />
                      </View>
                    ) : <EmptyChart msg="No cadence data — enable GPS cadence on Strava" />}
                    <Insight color={C[0]} text={`Target 170–180 spm. ${avgCadence > 0 ? `Your avg ${avgCadence} spm — ${avgCadence < 165 ? 'try shortening your stride' : avgCadence >= 170 ? 'great cadence!' : 'close to optimal'}` : 'Cadence reduces injury risk by cutting ground contact time.'}`} />
                  </>
                )}

                {/* ── ACTIVITY MIX ── */}
                {t.key === 'mix' && (
                  <>
                    <CardHeader title="Activity Mix" sub="All-time breakdown by sport" colors={C} />
                    {mixStats.length > 0 ? (
                      <>
                        <View style={{ alignItems: 'center', marginVertical: 16 }}>
                          <PieChart data={mixPieData} donut showText textColor="#fff"
                            radius={100} innerRadius={60} textSize={11}
                            isAnimated animationDuration={800}
                            centerLabelComponent={() => (
                              <View style={{ alignItems: 'center' }}>
                                <Activity color={theme.colors.primary} size={18} />
                                <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 2 }}>mix</Typography>
                              </View>
                            )} />
                        </View>
                        <View style={{ gap: 10 }}>
                          {mixStats.map(e => (
                            <View key={e.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
                              <View style={{ flex: 1 }}>
                                <Typography style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 3 }}>{e.type} — {e.count} activities</Typography>
                                <View style={{ height: 5, backgroundColor: theme.colors.background, borderRadius: 3, overflow: 'hidden' }}>
                                  <View style={{ height: '100%', width: `${e.pct}%`, backgroundColor: e.color, borderRadius: 3 }} />
                                </View>
                              </View>
                              <Typography style={{ fontSize: 12, fontWeight: '700', color: e.color, width: 36, textAlign: 'right' }}>{e.pct}%</Typography>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : <EmptyChart msg="No activities synced yet" />}
                  </>
                )}

                {/* ── ELEVATION ── */}
                {t.key === 'elevation' && (
                  <>
                    <CardHeader title="Elevation Gain" sub="Metres climbed per activity" colors={C}
                      stat={totalElev.toLocaleString()} statUnit="m total" />
                    {elevData.length > 1 ? (
                      <View style={{ overflow: 'hidden', marginTop: 12 }}>
                        <LineChart data={elevData} height={180} width={CHART_W} thickness={3} color={C[0]}
                          hideDataPoints curved areaChart
                          initialSpacing={0}
                          spacing={Math.max(CHART_W/Math.max(elevData.length-1,1),4)}
                          startFillColor={C[0]} endFillColor={theme.colors.background}
                          startOpacity={0.5} endOpacity={0}
                          yAxisLabelSuffix=" m"
                          pointerConfig={getPointerConfig('m', C[0])}
                          {...chartBase} />
                      </View>
                    ) : <EmptyChart msg="No elevation data yet" />}
                    <Insight color={C[0]} text={`${totalElev.toLocaleString()}m total climbed · Peak single activity: ${Math.round(maxElev)}m`} />
                  </>
                )}

                {/* ── CALORIES ── */}
                {t.key === 'calories' && (
                  <>
                    <CardHeader title="Calories Burned" sub="Weekly kcal from Strava" colors={C}
                      stat={avgCalories || '--'} statUnit="kcal/wk avg" />
                    {caloriesData.some(d=>d.value>0) ? (
                      <View style={{ overflow: 'hidden', marginTop: 12 }}>
                        <BarChart data={caloriesData} height={180} width={CHART_W} barWidth={BAR_W} roundedTop
                          maxValue={Math.ceil(Math.max(...caloriesData.map(d=>d.value),1) * 1.25)}
                          initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                          {...chartBase} />
                      </View>
                    ) : <EmptyChart msg="No calorie data from Strava" />}
                    {avgCalories > 0 && <Insight color={C[0]} text={`${avgCalories.toLocaleString()} kcal/wk avg — roughly ${Math.round(avgCalories / 7)} kcal/day from exercise`} />}
                  </>
                )}

                {/* ── POWER ── */}
                {t.key === 'power' && (
                  <>
                    <CardHeader title="Average Power" sub="Watts from power meter (last 20)" colors={C}
                      stat={avgPower || '--'} statUnit="W avg" />
                    {powerData.length > 1 ? (
                      <View style={{ overflow: 'hidden', marginTop: 12 }}>
                        <LineChart data={powerData} height={180} width={CHART_W} thickness={3} color={C[0]}
                          hideDataPoints curved areaChart
                          initialSpacing={12}
                          spacing={Math.max((CHART_W-12)/Math.max(powerData.length-1,1),18)}
                          startFillColor={C[0]} endFillColor={theme.colors.background}
                          startOpacity={0.5} endOpacity={0}
                          yAxisLabelSuffix=" W"
                          pointerConfig={getPointerConfig('W', C[0])}
                          {...chartBase} />
                      </View>
                    ) : <EmptyChart msg="No power data — requires a power meter" />}
                    {avgPower > 0 && <Insight color={C[0]} text={`${avgPower}W avg power across ${powerData.length} sessions`} />}
                  </>
                )}

              </Card>
            </Animated.View>
          );
        })}

        {activeKeys.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <BarChart3 size={48} color={theme.colors.textSecondary} />
            <Typography style={{ color: theme.colors.textSecondary, marginTop: 16, fontSize: 15 }}>No graphs enabled</Typography>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => setShowManageModal(true)}>
              <Typography style={{ color: theme.colors.primary, fontWeight: '700' }}>Tap Manage to add some →</Typography>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Manage modal */}
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
                <Switch value={activeKeys.includes(t.key)} onValueChange={() => toggleGraph(t.key)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }} />
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

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  pageSub:   { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '15' },
  manageBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },

  card: { padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardAccent: { width: 4, height: 44, borderRadius: 2 },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  cardSub:    { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  statChip:   { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  statChipVal:  { fontSize: 16, fontWeight: '800' },
  statChipUnit: { fontSize: 10, fontWeight: '600', marginTop: 1 },

  insightBar:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: 10, borderRadius: 8, borderLeftWidth: 3 },
  insightText: { fontSize: 12, flex: 1, lineHeight: 18, fontWeight: '600' },

  emptyChart: { height: 120, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  emptyText:  { color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
