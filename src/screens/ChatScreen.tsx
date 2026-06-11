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
  FadeInLeft,
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
import { Send, Bot, RefreshCw, Sparkles } from 'lucide-react-native';
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
import { PressableScale } from '../components/PressableScale';

const SUGGESTIONS = [
  'How should I pace my long run this weekend?',
  'Am I overtraining based on my recent data?',
  'What\'s a good workout for improving my 5K pace?',
  'How much rest do I need before my next race?',
  'Explain my training load this week.',
];

// Compact chips shown above the input bar once the coach has replied.
const FOLLOW_UP_CHIPS = [
  'Why?',
  'Give me a plan',
  'Show example workout',
];

// Family used across the chat surface — chat is "social" in our taxonomy.
const SOCIAL = familyStyle('social');

const DOT_COLORS = [theme.colors.primary, SOCIAL.accent, theme.colors.accent];

// Shape of one persisted transcript entry in store.coachChat.
type CoachChatMsg = { role: 'user' | 'assistant'; text: string; at: string };

function formatTime(at: string) {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${mm} ${ampm}`;
}

function CoachAvatar({ size = 28 }: { size?: number }) {
  return (
    <LinearGradient
      colors={SOCIAL.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.coachAvatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Bot size={Math.round(size * 0.55)} color={theme.colors.onAccent} />
    </LinearGradient>
  );
}

// One looping 0→1 progress drives all three dots; each dot reads it at a
// staggered phase offset so the wave ripples left to right.
function useDotStyle(progress: SharedValue<number>, index: number) {
  return useAnimatedStyle(() => {
    const phase = (progress.value + 1 - index * 0.16) % 1;
    return {
      opacity: interpolate(phase, [0, 0.3, 0.6, 1], [0.4, 1, 0.4, 0.4]),
      transform: [{ translateY: interpolate(phase, [0, 0.3, 0.6, 1], [0, -6, 0, 0]) }],
    };
  });
}

function ThinkingDots() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const dotStyles = [useDotStyle(progress, 0), useDotStyle(progress, 1), useDotStyle(progress, 2)];

  return (
    <View style={styles.typingRow}>
      <CoachAvatar size={28} />
      <View style={styles.typingBubble}>
        {dotStyles.map((style, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { backgroundColor: DOT_COLORS[i] }, style]}
          />
        ))}
      </View>
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: theme.typography.body.fontSize, lineHeight: 22 },
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

// One chat row — memoised so appending a message doesn't re-render the whole
// transcript. The coach reply lands as a single bubble with FadeInDown.
const MessageBubble = React.memo(function MessageBubble({ message }: { message: CoachChatMsg }) {
  const isUser = message.role === 'user';
  const Enter = isUser ? FadeInRight : FadeInDown;

  return (
    <Animated.View
      entering={Enter.duration(280).springify().damping(18)}
      style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapBot]}
    >
      {!isUser && (
        <View style={styles.coachSide}>
          <CoachAvatar size={28} />
        </View>
      )}
      <View style={[styles.bubbleColumn, isUser ? styles.bubbleColumnUser : styles.bubbleColumnBot]}>
        {isUser ? (
          <LinearGradient
            colors={SOCIAL.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.bubbleUser, theme.shadows.sm]}
          >
            <Text style={styles.bubbleUserText}>{message.text}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.bubbleBot, { borderLeftColor: SOCIAL.accent }]}>
            <Markdown style={markdownStyles}>{message.text}</Markdown>
          </View>
        )}
        <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampBot]}>
          {formatTime(message.at)}
        </Text>
      </View>
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
  // The message a failed send should retry with (also restored to the input).
  const [failedText, setFailedText] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const listRef = useRef<FlatList>(null);
  const tabBarHeight = useBottomTabBarHeight();

  // The coach service injects today's prescription + adherence when it gets a
  // structured goal — pass the first non-simple one.
  const coachGoal = useMemo(() => goals.find(g => !g.isSimple), [goals]);

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
      // The AI service expects ChatMessage (role + text) — strip the local
      // timestamp before sending so payload semantics are unchanged.
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
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (e: any) {
      // Pull the failed user turn back out of the transcript and into the
      // input so retrying doesn't double-send it.
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

  const renderItem = ({ item }: { item: CoachChatMsg }) => <MessageBubble message={item} />;

  const lastMessage = messages[messages.length - 1];
  const showFollowUps = !loading && lastMessage?.role === 'assistant';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — social-family gradient strip with coach avatar + status pill */}
      <LinearGradient
        colors={SOCIAL.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatarRing}>
            <CoachAvatar size={40} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Coach</Text>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText} numberOfLines={1}>
                Online · {settings.coachPersonality}
              </Text>
            </View>
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
            <Icon icon={RefreshCw} variant="plain" size="sm" color={theme.colors.onAccent} />
          </PressableScale>
        )}
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        {/* Message list */}
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyHero}>
              <LinearGradient
                colors={SOCIAL.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyIconBg}
              >
                <Sparkles size={36} color={theme.colors.onAccent} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Hi, I'm your coach</Text>
              <Text style={styles.emptySub}>
                Ask about your plans, recovery, pacing, or anything running-related.
              </Text>
            </Animated.View>
            <Text style={styles.suggestLabel}>Starter prompts</Text>
            {SUGGESTIONS.slice(0, 3).map((s, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(400 + i * 55).springify()}>
                <PressableScale
                  style={styles.suggestChip}
                  onPress={() => send(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                >
                  <View style={[styles.suggestAccent, { backgroundColor: SOCIAL.accent }]} />
                  <Text style={styles.suggestText}>{s}</Text>
                </PressableScale>
              </Animated.View>
            ))}
            <Text style={[styles.suggestLabel, { marginTop: 16 }]}>More ideas</Text>
            {SUGGESTIONS.slice(3).map((s, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(400 + (3 + i) * 55).springify()}>
                <PressableScale
                  style={styles.suggestChip}
                  onPress={() => send(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                >
                  <View style={[styles.suggestAccent, { backgroundColor: SOCIAL.accent }]} />
                  <Text style={styles.suggestText}>{s}</Text>
                </PressableScale>
              </Animated.View>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${item.at}-${index}`}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              loading ? (
                <Animated.View entering={FadeInLeft.duration(280)} exiting={FadeOut.duration(180)}>
                  <ThinkingDots />
                </Animated.View>
              ) : null
            }
          />
        )}

        {/* Error — retryable: the failed message is back in the input */}
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

        {/* Quick-reply chips — shown above the input bar after a coach reply */}
        {showFollowUps && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {FOLLOW_UP_CHIPS.map((chip) => (
              <PressableScale
                key={chip}
                style={[styles.quickChip, { backgroundColor: SOCIAL.tint, borderColor: withAlpha(SOCIAL.accent, 'strong') }]}
                onPress={() => send(chip)}
                accessibilityRole="button"
                accessibilityLabel={chip}
              >
                <Text style={[styles.quickChipText, { color: SOCIAL.accent }]}>{chip}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coach…"
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
              <Icon icon={Send} variant="plain" size="md" color={theme.colors.textSecondary} />
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
                <Icon icon={Send} variant="plain" size="md" color={theme.colors.onAccent} />
              </LinearGradient>
            </PressableScale>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Clear-chat confirmation */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerAvatarRing: {
    padding: 2,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.onAccent, 'medium'),
    backgroundColor: withAlpha(theme.colors.onAccent, 'soft'),
  },
  coachAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: theme.typography.subtitle.fontSize, fontFamily: theme.fonts.bold, color: theme.colors.onAccent, letterSpacing: -0.2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: withAlpha(theme.colors.onAccent, 'tint'),
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.onAccent, 'medium'),
    marginTop: 4,
    maxWidth: '100%',
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  statusText: { fontSize: theme.typography.label.fontSize, color: theme.colors.onAccent, fontWeight: theme.typography.caption.fontWeight, letterSpacing: 0.2 },
  clearBtn: { padding: 8 },

  // Empty state
  emptyContainer: { padding: 24, paddingTop: 32 },
  emptyHero: { alignItems: 'center', marginBottom: 32 },
  emptyIconBg: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    ...theme.shadows.lg,
  },
  emptyTitle: { fontSize: theme.typography.title.fontSize, fontFamily: theme.fonts.display, color: theme.colors.text, marginBottom: 8, letterSpacing: -0.3 },
  emptySub: { fontSize: theme.typography.body.fontSize, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  suggestLabel: { fontSize: theme.typography.label.fontSize, color: theme.colors.textSecondary, marginBottom: 10, fontWeight: theme.typography.label.fontWeight, letterSpacing: 1, textTransform: 'uppercase' },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    ...theme.shadows.sm,
  },
  suggestAccent: { width: 3, height: 22, borderRadius: 2, marginRight: 10 },
  suggestText: { color: theme.colors.text, fontSize: theme.typography.body.fontSize, lineHeight: 21, flex: 1 },

  // Messages
  list: { padding: 16, paddingBottom: 8 },
  bubbleWrap: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  bubbleWrapUser: { justifyContent: 'flex-end' },
  bubbleWrapBot: { justifyContent: 'flex-start' },
  coachSide: { marginRight: 8, marginTop: 2 },
  bubbleColumn: { maxWidth: '78%' },
  bubbleColumnUser: { alignItems: 'flex-end' },
  bubbleColumnBot: { alignItems: 'flex-start' },
  bubble: { borderRadius: 18, padding: 12 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleBot: {
    backgroundColor: theme.colors.surfaceElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    borderLeftWidth: 3,
    ...theme.shadows.sm,
  },
  bubbleUserText: { color: theme.colors.onAccent, fontSize: theme.typography.body.fontSize, lineHeight: 22, fontWeight: theme.typography.body.fontWeight },
  timestamp: { fontSize: theme.typography.micro.fontSize, color: theme.colors.textSecondary, marginTop: 4, letterSpacing: 0.3 },
  timestampUser: { marginRight: 4 },
  timestampBot: { marginLeft: 4 },

  // Thinking dots
  typingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 14, gap: 8 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

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

  // Quick-reply chips
  quickRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: { fontSize: theme.typography.footnote.fontSize, fontWeight: '700', lineHeight: 18 },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },

  // Clear-chat confirm sheet
  confirmActions: { gap: 10, paddingTop: 4 },
});
