import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReAnimated, { FadeInDown, FadeInRight, FadeInLeft, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from 'react-native-markdown-display';
import { Send, Bot, RefreshCw, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from '../components/Icon';
import { useStore } from '../store/useStore';
import { AIService, ChatMessage } from '../services/ai';
import { theme } from '../theme';
import { secureSettingsStorage } from '../store/useStore';
import { familyStyle } from '../utils/widgetFamilies';
import { PressableScale } from '../components/PressableScale';
import { SkeletonChatMessage } from '../components/SkeletonPresets';

const SUGGESTIONS = [
  'How should I pace my long run this weekend?',
  'Am I overtraining based on my recent data?',
  'What\'s a good workout for improving my 5K pace?',
  'How much rest do I need before my next race?',
  'Explain my training load this week.',
];

// Compact chips shown above the input bar once a conversation is in progress.
const FOLLOW_UP_CHIPS = [
  'Why?',
  'Give me a plan',
  'Show example workout',
];

const DOT_COLORS = ['#f97316', '#ec4899', '#8b5cf6'];

// Family used across the chat surface — chat is "social" in our taxonomy.
const SOCIAL = familyStyle('social');

// ChatMessage with a local timestamp + stable id. We don't mutate the AIService
// type so network payloads remain unchanged; ts/id are purely UI-side.
type UIMessage = ChatMessage & { ts: number; id: string };

let messageSeq = 0;
const nextMessageId = (role: ChatMessage['role']) => `${role}-${Date.now()}-${messageSeq++}`;

function formatTime(ts: number) {
  const d = new Date(ts);
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
      <Bot size={Math.round(size * 0.55)} color="#fff" />
    </LinearGradient>
  );
}

function ThinkingDots() {
  const anims = useRef(DOT_COLORS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 380, useNativeDriver: true }),
          Animated.delay((DOT_COLORS.length - i - 1) * 160),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.typingRow}>
      <CoachAvatar size={28} />
      <View style={styles.typingBubble}>
        {anims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: DOT_COLORS[i] },
              {
                transform: [{
                  translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }),
                }],
                opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// Blinking caret shown at the tail of the assistant bubble while its text is
// still being revealed word-by-word. Pure opacity pulse on the native driver.
function StreamingCaret() {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return <Animated.View style={[styles.caret, { opacity: blink }]} />;
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
    backgroundColor: '#ffffff15',
    borderRadius: 4,
    paddingHorizontal: 5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#ec4899',
  },
  fence: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  code_block: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#a5f3fc',
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
    fontSize: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  td: {
    padding: 8,
    color: theme.colors.text,
    fontSize: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  tr: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row' },
  link: { color: '#6366f1', textDecorationLine: 'underline' },
  paragraph: { marginVertical: 3 },
});

// One chat row — extracted so the renderItem stays tiny and so styling for
// the user-vs-coach split lives in a single place.
function MessageBubble({ message, streaming = false }: { message: UIMessage; streaming?: boolean }) {
  const isUser = message.role === 'user';
  const Enter = isUser ? FadeInRight : FadeInLeft;

  return (
    <ReAnimated.View
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
            <Markdown style={markdownStyles}>{streaming && !message.text ? '…' : message.text}</Markdown>
            {streaming && <StreamingCaret />}
          </View>
        )}
        {!streaming && (
          <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampBot]}>
            {formatTime(message.ts)}
          </Text>
        )}
      </View>
    </ReAnimated.View>
  );
}

export default function ChatScreen() {
  const { settings, userProfile, activities } = useStore();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id of the assistant message currently being revealed word-by-word.
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear any in-flight reveal interval on unmount.
  useEffect(() => () => { if (streamTimer.current) clearInterval(streamTimer.current); }, []);

  // The AI service returns the full reply at once, so we fake the "watch the
  // coach write" moment: append an empty assistant bubble, then reveal the
  // reply word-by-word into it. The bot skeleton drops on the first token.
  const streamReply = useCallback((fullText: string) => {
    const words = fullText.split(/(\s+)/); // keep whitespace tokens for spacing
    const id = nextMessageId('assistant');
    setStreamingId(id);
    setLoading(false); // drop the thinking-dots/skeleton footer
    setMessages(prev => [...prev, { role: 'assistant', text: '', ts: Date.now(), id }]);

    // Reveal a scaled number of tokens per tick so the whole reply lands in
    // ~REVEAL_MS regardless of length — a short reply types out word-by-word,
    // a long one streams several words per frame. Bounds both the perceived
    // wait and the number of list re-renders.
    const REVEAL_MS = 1100;
    const TICK_MS = 16;
    const step = Math.max(1, Math.ceil(words.length / (REVEAL_MS / TICK_MS)));
    let i = 0;
    streamTimer.current = setInterval(() => {
      i = Math.min(words.length, i + step);
      const partial = words.slice(0, i).join('');
      setMessages(prev =>
        prev.map(m => (m.id === id ? { ...m, text: partial } : m))
      );
      listRef.current?.scrollToEnd({ animated: false });
      if (i >= words.length) {
        if (streamTimer.current) clearInterval(streamTimer.current);
        streamTimer.current = null;
        setStreamingId(null);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      }
    }, TICK_MS);
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading || streamingId) return;
    setError(null);

    const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
    if (!apiKey) { setError('Add your API key in Settings first.'); return; }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: UIMessage = { role: 'user', text: text.trim(), ts: Date.now(), id: nextMessageId('user') };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      // The AI service expects ChatMessage (role + text) — strip the local
      // ui-only fields before sending so payload semantics are unchanged.
      const payload: ChatMessage[] = next.map(({ role, text }) => ({ role, text }));
      const reply = await AIService.chatWithCoach(
        payload, settings.llmProvider, apiKey,
        settings.coachPersonality, userProfile, activities
      );
      streamReply(reply);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Request failed.');
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading, streamingId, settings, userProfile, activities, streamReply]);

  const clear = () => {
    if (streamTimer.current) { clearInterval(streamTimer.current); streamTimer.current = null; }
    setStreamingId(null);
    setMessages([]);
    setError(null);
  };

  const renderItem = ({ item }: { item: UIMessage }) => (
    <MessageBubble message={item} streaming={item.id === streamingId} />
  );

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
          <TouchableOpacity
            onPress={clear}
            style={styles.clearBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear conversation"
          >
            <Icon icon={RefreshCw} variant="plain" size="sm" color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        )}
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Message list */}
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false}>
            <ReAnimated.View entering={FadeInDown.duration(400)} style={styles.emptyHero}>
              <LinearGradient
                colors={SOCIAL.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyIconBg}
              >
                <Sparkles size={36} color="#fff" />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Hi, I'm your coach</Text>
              <Text style={styles.emptySub}>
                Ask about your plans, recovery, pacing, or anything running-related.
              </Text>
            </ReAnimated.View>
            <Text style={styles.suggestLabel}>Starter prompts</Text>
            {SUGGESTIONS.slice(0, 3).map((s, i) => (
              <ReAnimated.View key={i} entering={FadeInDown.delay(400 + i * 55).springify()}>
                <PressableScale
                  style={styles.suggestChip}
                  onPress={() => send(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                >
                  <View style={[styles.suggestAccent, { backgroundColor: SOCIAL.accent }]} />
                  <Text style={styles.suggestText}>{s}</Text>
                </PressableScale>
              </ReAnimated.View>
            ))}
            <Text style={[styles.suggestLabel, { marginTop: 16 }]}>More ideas</Text>
            {SUGGESTIONS.slice(3).map((s, i) => (
              <ReAnimated.View key={i} entering={FadeInDown.delay(400 + (3 + i) * 55).springify()}>
                <PressableScale
                  style={styles.suggestChip}
                  onPress={() => send(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                >
                  <View style={[styles.suggestAccent, { backgroundColor: SOCIAL.accent }]} />
                  <Text style={styles.suggestText}>{s}</Text>
                </PressableScale>
              </ReAnimated.View>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              loading ? (
                <ReAnimated.View entering={FadeInLeft.duration(280)} exiting={FadeOut.duration(180)}>
                  <ThinkingDots />
                  <SkeletonChatMessage side="bot" />
                </ReAnimated.View>
              ) : null
            }
          />
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Quick-reply chips — shown above the input bar once chatting */}
        {messages.length > 0 && !loading && !streamingId && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {FOLLOW_UP_CHIPS.map((chip) => (
              <PressableScale
                key={chip}
                style={[styles.quickChip, { backgroundColor: SOCIAL.tint, borderColor: SOCIAL.accent + '55' }]}
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
          {(!input.trim() || loading || streamingId) ? (
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
                <Icon icon={Send} variant="plain" size="md" color="#fff" />
              </LinearGradient>
            </PressableScale>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

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
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  coachAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: theme.typography.subtitle.fontSize, fontFamily: theme.fonts.bold, color: '#fff', letterSpacing: -0.2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginTop: 4,
    maxWidth: '100%',
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#34D399',
  },
  statusText: { fontSize: 11, color: '#fff', fontWeight: theme.typography.caption.fontWeight, letterSpacing: 0.2 },
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
  suggestLabel: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
    borderLeftWidth: 3,
    ...theme.shadows.sm,
  },
  // Blinking cursor shown beneath the streamed markdown while the reply writes.
  caret: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: SOCIAL.accent,
    marginTop: 2,
  },
  bubbleUserText: { color: '#fff', fontSize: theme.typography.body.fontSize, lineHeight: 22, fontWeight: theme.typography.body.fontWeight },
  timestamp: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4, letterSpacing: 0.3 },
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
    backgroundColor: '#ef44441a',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#ef444440',
  },
  errorText: { color: theme.colors.error, fontSize: 13 },

  // Quick-reply chips
  quickRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },

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
    backgroundColor: '#ffffff0d',
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
});
