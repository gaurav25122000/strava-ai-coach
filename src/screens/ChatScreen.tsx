import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  cancelAnimation,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from 'react-native-markdown-display';
import { Send, RefreshCw, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { useStore } from '../store/useStore';
import { AIService, ChatMessage } from '../services/ai';
import { theme, withAlpha } from '../theme';
import { secureSettingsStorage } from '../store/useStore';
import { familyStyle } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr } from '../utils/dates';
import { prescriptionFor } from '../services/goalProgress';
import { PressableScale } from '../components/PressableScale';

// Family used across the chat surface — chat is "social" in our taxonomy.
const SOCIAL = familyStyle('social');

// Show a time divider when two messages are more than this far apart.
const TIME_GAP_MS = 10 * 60 * 1000;

// Shape of one persisted transcript entry in store.coachChat.
type CoachChatMsg = { role: 'user' | 'assistant'; text: string; at: string };

type Row =
  | { kind: 'msg'; msg: CoachChatMsg; firstOfGroup: boolean }
  | { kind: 'divider'; at: string };

function formatTime(at: string) {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${hh}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

function dayPart(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

/**
 * Suggestions built from the athlete's actual state, not a canned list —
 * this is most of what makes the screen feel like a coach who knows you.
 */
function useSmartSuggestions(): string[] {
  const activities = useStore((s) => s.activities);
  const goals = useStore((s) => s.goals);
  const userStats = useStore((s) => s.userStats);
  const weeklyGoalKm = useStore((s) => s.userProfile.weeklyGoalKm);

  return useMemo(() => {
    const out: string[] = [];
    const goal = goals.find((g) => !g.isSimple);

    if (goal) {
      const rx = prescriptionFor(goal, new Date());
      if (rx && rx.kind !== 'REST') {
        out.push(`Walk me through today's ${rx.title || rx.kind.toLowerCase()} — how should it feel?`);
      } else if (rx) {
        out.push('What should a proper rest day look like for me today?');
      }
      out.push(`Am I on track for ${goal.title} on ${goal.targetDate}?`);
    }

    const today = localDateStr(new Date());
    const movedToday = activities.some((a) => activityDayKey(a) === today);
    if (!movedToday && userStats.currentStreak > 0) {
      out.push(`What's the lightest session that still keeps my ${userStats.currentStreak}-day streak alive?`);
    }

    if (weeklyGoalKm > 0) {
      const monday = localDateStr(
        (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; })(),
      );
      const weekKm = activities
        .filter((a) => activityDayKey(a) >= monday)
        .reduce((s, a) => s + a.distance / 1000, 0);
      const left = weeklyGoalKm - weekKm;
      if (left > 0 && left <= weeklyGoalKm * 0.5) {
        out.push(`I'm ${left.toFixed(1)} km short of this week's goal — how do I close it without overdoing it?`);
      }
    }

    const recent = activities[0];
    if (recent?.name) {
      out.push(`Give me honest feedback on "${recent.name}".`);
    }

    // Evergreens to round the list out.
    out.push('Am I overtraining based on my recent data?');
    out.push('Build me a workout for this weekend.');
    return out.slice(0, 5);
  }, [activities, goals, userStats.currentStreak, weeklyGoalKm]);
}

/** One-line training context for the greeting — proof the coach is looking. */
function useGreetingContext(): string {
  const activities = useStore((s) => s.activities);
  const userStats = useStore((s) => s.userStats);
  return useMemo(() => {
    const bits: string[] = [];
    if (userStats.currentStreak > 0) bits.push(`${userStats.currentStreak}-day streak`);
    const recent = activities[0];
    if (recent) {
      const km = (recent.distance / 1000).toFixed(1);
      bits.push(`last out: ${recent.name || recent.type} (${km} km)`);
    }
    return bits.length ? bits.join(' · ') : 'Synced and ready when you are.';
  }, [activities, userStats.currentStreak]);
}

// One looping 0→1 progress drives all three dots at staggered phases.
function useDotStyle(progress: SharedValue<number>, index: number) {
  return useAnimatedStyle(() => {
    const phase = (progress.value + 1 - index * 0.16) % 1;
    return {
      opacity: interpolate(phase, [0, 0.3, 0.6, 1], [0.35, 1, 0.35, 0.35]),
      transform: [{ translateY: interpolate(phase, [0, 0.3, 0.6, 1], [0, -4, 0, 0]) }],
    };
  });
}

function Thinking() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress]);
  const dotStyles = [useDotStyle(progress, 0), useDotStyle(progress, 1), useDotStyle(progress, 2)];
  return (
    <View style={styles.thinkingRow}>
      <Text style={styles.thinkingTxt}>Coach is thinking</Text>
      {dotStyles.map((s, i) => (
        <Animated.View key={i} style={[styles.thinkingDot, s]} />
      ))}
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: theme.typography.body.fontSize, lineHeight: 23 },
  heading1: { color: theme.colors.text, fontSize: theme.typography.subtitle.fontSize, fontWeight: '700', marginBottom: 4, marginTop: 6 },
  heading2: { color: theme.colors.text, fontSize: theme.typography.body.fontSize, fontWeight: '700', marginBottom: 3, marginTop: 5 },
  heading3: { color: SOCIAL.accent, fontSize: 14, fontWeight: '700', marginBottom: 2, marginTop: 4 },
  strong: { fontWeight: '700', color: theme.colors.text },
  em: { fontStyle: 'italic', color: theme.colors.textSecondary },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { flexDirection: 'row', marginBottom: 4 },
  bullet_list_icon: { color: SOCIAL.accent, fontSize: 14, marginRight: 6, marginTop: 2 },
  code_inline: {
    backgroundColor: withAlpha(theme.colors.text, 'soft'),
    borderRadius: 4,
    paddingHorizontal: 5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: theme.typography.caption.fontSize,
    color: SOCIAL.accent,
  },
  fence: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  code_block: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: theme.typography.caption.fontSize,
    color: familyStyle('recovery').accent,
  },
  blockquote: {
    backgroundColor: SOCIAL.tint,
    borderLeftWidth: 3,
    borderLeftColor: SOCIAL.accent,
    paddingLeft: 10,
    marginVertical: 6,
    borderRadius: 4,
  },
  hr: { backgroundColor: theme.colors.border, height: 1, marginVertical: 10 },
  table: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  thead: { backgroundColor: SOCIAL.tint },
  th: {
    padding: 8,
    fontWeight: '700',
    color: SOCIAL.accent,
    fontSize: theme.typography.caption.fontSize,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  td: {
    padding: 8,
    color: theme.colors.text,
    fontSize: theme.typography.caption.fontSize,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  tr: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row' },
  link: { color: theme.colors.info, textDecorationLine: 'underline' },
  paragraph: { marginVertical: 3 },
});

/**
 * User turns stay as compact gradient bubbles; coach turns read as open
 * conversational text with a tiny "COACH" rule above the first message of a
 * group — closer to a message from a person than a chatbot card.
 */
const MessageRow = React.memo(function MessageRow({
  msg,
  firstOfGroup,
}: {
  msg: CoachChatMsg;
  firstOfGroup: boolean;
}) {
  if (msg.role === 'user') {
    return (
      <Animated.View entering={FadeInRight.duration(240).springify().damping(18)} style={styles.userWrap}>
        <LinearGradient
          colors={SOCIAL.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.userBubble, theme.shadows.sm]}
        >
          <Text style={styles.userText}>{msg.text}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={styles.coachWrap}>
      {firstOfGroup && (
        <View style={styles.coachTag}>
          <View style={[styles.coachTagDot, { backgroundColor: SOCIAL.accent }]} />
          <Text style={[styles.coachTagTxt, { color: SOCIAL.accent }]}>COACH</Text>
        </View>
      )}
      <Markdown style={markdownStyles}>{msg.text}</Markdown>
    </Animated.View>
  );
});

export default function ChatScreen() {
  const settings = useStore(s => s.settings);
  const userProfile = useStore(s => s.userProfile);
  const activities = useStore(s => s.activities);
  const goals = useStore(s => s.goals);
  const bestEfforts = useStore(s => s.bestEfforts);
  const messages = useStore(s => s.coachChat);
  const setCoachChat = useStore(s => s.setCoachChat);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const listRef = useRef<FlatList>(null);
  const tabBarHeight = useBottomTabBarHeight();

  const suggestions = useSmartSuggestions();
  const greetingContext = useGreetingContext();
  const firstName = (userProfile.name || '').trim().split(/\s+/)[0];

  const coachGoal = useMemo(() => goals.find(g => !g.isSimple), [goals]);

  // Transcript → rows with time dividers and coach-group markers.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prev: CoachChatMsg | null = null;
    for (const m of messages) {
      const gap = prev ? new Date(m.at).getTime() - new Date(prev.at).getTime() : Infinity;
      if (gap > TIME_GAP_MS) out.push({ kind: 'divider', at: m.at });
      const firstOfGroup =
        m.role === 'assistant' && (!prev || prev.role !== 'assistant' || gap > TIME_GAP_MS);
      out.push({ kind: 'msg', msg: m, firstOfGroup });
      prev = m;
    }
    return out;
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setFailedText(null);

    const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
    if (!apiKey) {
      setError('Add your API key in Settings first.');
      setFailedText(trimmed);
      return;
    }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const next: CoachChatMsg[] = [
      ...useStore.getState().coachChat,
      { role: 'user', text: trimmed, at: new Date().toISOString() },
    ];
    setCoachChat(next);
    setInput('');
    setLoading(true);

    try {
      const payload: ChatMessage[] = next.map(({ role, text: t }) => ({ role, text: t }));
      const reply = await AIService.chatWithCoach(
        payload,
        settings.llmProvider,
        apiKey,
        settings.coachPersonality,
        userProfile,
        activities,
        coachGoal,
        { bestEfforts, unit: settings.unit },
      );
      setCoachChat([
        ...useStore.getState().coachChat,
        { role: 'assistant', text: reply, at: new Date().toISOString() },
      ]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (e: any) {
      const cur = useStore.getState().coachChat;
      const last = cur[cur.length - 1];
      if (last && last.role === 'user' && last.text === trimmed) {
        setCoachChat(cur.slice(0, -1));
      }
      setInput(trimmed);
      setFailedText(trimmed);
      setError(e?.response?.data?.error?.message || e?.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  }, [loading, settings, userProfile, activities, coachGoal, bestEfforts, setCoachChat]);

  const clear = useCallback(() => {
    setConfirmClear(false);
    setCoachChat([]);
    setError(null);
    setFailedText(null);
  }, [setCoachChat]);

  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.kind === 'divider') {
      return (
        <View style={styles.timeDivider}>
          <Text style={styles.timeDividerTxt}>{formatTime(item.at)}</Text>
        </View>
      );
    }
    return <MessageRow msg={item.msg} firstOfGroup={item.firstOfGroup} />;
  }, []);

  const lastMessage = messages[messages.length - 1];
  const showFollowUps = !loading && lastMessage?.role === 'assistant';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Minimal header — matches the rest of the app's chrome. */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Text style={styles.brand}>Coach</Text>
          <View style={[styles.personaChip, { backgroundColor: SOCIAL.tint }]}>
            <Zap size={10} color={SOCIAL.accent} />
            <Text style={[styles.personaTxt, { color: SOCIAL.accent }]}>
              {settings.coachPersonality}
            </Text>
          </View>
        </View>
        {messages.length > 0 && (
          <PressableScale
            onPress={() => setConfirmClear(true)}
            style={styles.clearBtn}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Clear conversation"
          >
            <Icon icon={RefreshCw} variant="plain" size="sm" color={theme.colors.textSecondary} />
          </PressableScale>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text style={styles.greetTitle}>
                {dayPart()}
                {firstName ? `, ${firstName}` : ''}.
              </Text>
              <Text style={styles.greetSub}>{greetingContext}</Text>
              <View style={[styles.greetRule, { backgroundColor: withAlpha(SOCIAL.accent, 'strong') }]} />
            </Animated.View>

            {suggestions.map((s, i) => (
              <Animated.View key={s} entering={FadeInDown.delay(150 + i * 60).springify().damping(16)}>
                <PressableScale
                  style={styles.suggestChip}
                  onPress={() => send(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                >
                  <Text style={styles.suggestText}>{s}</Text>
                  <Icon icon={Send} variant="plain" size="xs" color={withAlpha(SOCIAL.accent, 'heavy')} />
                </PressableScale>
              </Animated.View>
            ))}
            <Text style={styles.greetFootnote}>
              Your coach sees your synced training, PRs and plan — ask anything.
            </Text>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item, index) =>
              item.kind === 'divider' ? `div-${item.at}-${index}` : `${item.msg.at}-${index}`
            }
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              loading ? (
                <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOut.duration(160)}>
                  <Thinking />
                </Animated.View>
              ) : null
            }
          />
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            {failedText != null && (
              <Button
                title="Tap to retry"
                variant="secondary"
                size="sm"
                onPress={() => send(input.trim() ? input : failedText)}
              />
            )}
          </View>
        )}

        {showFollowUps && (
          <View style={styles.quickRow}>
            {['Why?', 'Make that a workout', 'Adjust for how I feel'].map((chip) => (
              <PressableScale
                key={chip}
                style={styles.quickChip}
                onPress={() => send(chip)}
                accessibilityRole="button"
                accessibilityLabel={chip}
              >
                <Text style={styles.quickChipText}>{chip}</Text>
              </PressableScale>
            ))}
          </View>
        )}

        {/* Floating input pill */}
        <View style={styles.inputWrap}>
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={firstName ? `Talk to your coach, ${firstName}…` : 'Talk to your coach…'}
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              maxLength={600}
              returnKeyType="default"
            />
            {(!input.trim() || loading) ? (
              <View
                style={[styles.sendBtn, styles.sendBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: true }}
              >
                <Icon icon={Send} variant="plain" size="sm" color={theme.colors.textSecondary} />
              </View>
            ) : (
              <PressableScale
                onPress={() => send(input)}
                haptic="none"
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <LinearGradient
                  colors={SOCIAL.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.sendBtn, theme.shadows.glow(SOCIAL.accent)]}
                >
                  <Icon icon={Send} variant="plain" size="sm" color={theme.colors.onAccent} />
                </LinearGradient>
              </PressableScale>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear chat?"
        caption="This deletes your whole conversation with the coach."
      >
        <View style={styles.confirmActions}>
          <Button title="Clear conversation" variant="destructive" fullWidth onPress={clear} />
          <Button title="Cancel" variant="ghost" fullWidth onPress={() => setConfirmClear(false)} />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

  // Header
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 6,
    paddingBottom: 8,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { ...theme.typography.title, color: theme.colors.text },
  personaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  personaTxt: { ...theme.typography.label, textTransform: 'capitalize' },
  clearBtn: { padding: 6 },

  // Empty / greeting
  emptyContainer: { padding: 24, paddingTop: 28 },
  greetTitle: {
    fontSize: 28,
    fontFamily: theme.fonts.display,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  greetSub: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  greetRule: { width: 36, height: 3, borderRadius: 2, marginTop: 14, marginBottom: 22 },
  suggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  suggestText: { color: theme.colors.text, fontSize: theme.typography.footnote.fontSize, lineHeight: 19, flex: 1 },
  greetFootnote: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 14,
  },

  // Messages
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  userWrap: { alignItems: 'flex-end', marginVertical: 6 },
  userBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: theme.colors.onAccent, fontSize: theme.typography.body.fontSize, lineHeight: 22 },
  coachWrap: { marginVertical: 8, paddingRight: 12 },
  coachTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  coachTagDot: { width: 6, height: 6, borderRadius: 3 },
  coachTagTxt: { ...theme.typography.label, letterSpacing: 1.2 },
  timeDivider: { alignItems: 'center', marginVertical: 10 },
  timeDividerTxt: { ...theme.typography.micro, color: theme.colors.textSecondary, letterSpacing: 0.4 },

  // Thinking
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 10 },
  thinkingTxt: { ...theme.typography.footnote, color: theme.colors.textSecondary, marginRight: 4 },
  thinkingDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: SOCIAL.accent },

  // Error
  errorBanner: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: withAlpha(theme.colors.error, 'soft'),
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: withAlpha(theme.colors.error, 'medium'),
    gap: 8,
    alignItems: 'flex-start',
  },
  errorText: { color: theme.colors.error, fontSize: theme.typography.footnote.fontSize },

  // Quick replies
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  quickChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: withAlpha(SOCIAL.accent, 'strong'),
  },
  quickChipText: {
    fontSize: theme.typography.footnote.fontSize,
    lineHeight: 18,
    fontWeight: '600',
    color: SOCIAL.accent,
  },

  // Floating input
  inputWrap: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    ...theme.shadows.md,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
    maxHeight: 110,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.surfaceMuted },

  confirmActions: { gap: 10, paddingTop: 4 },
});
