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
  SafeAreaView,
  ScrollView,
  Animated,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Send, Bot, RefreshCw } from 'lucide-react-native';
import { useStore } from '../store/useStore';
import { AIService, ChatMessage } from '../services/ai';
import { theme } from '../theme';
import { secureSettingsStorage } from '../store/useStore';

const SUGGESTIONS = [
  'How should I pace my long run this weekend?',
  'Am I overtraining based on my recent data?',
  'What\'s a good workout for improving my 5K pace?',
  'How much rest do I need before my next race?',
  'Explain my training load this week.',
];

const DOT_COLORS = ['#f97316', '#ec4899', '#8b5cf6'];

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
      <View style={styles.avatar}>
        <Bot size={14} color={theme.colors.primary} />
      </View>
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

const markdownStyles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
  heading1: { color: theme.colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4, marginTop: 6 },
  heading2: { color: theme.colors.text, fontSize: 15, fontWeight: '700', marginBottom: 3, marginTop: 5 },
  heading3: { color: '#f97316', fontSize: 14, fontWeight: '700', marginBottom: 2, marginTop: 4 },
  strong: { fontWeight: '700', color: theme.colors.text },
  em: { fontStyle: 'italic', color: theme.colors.textSecondary },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { flexDirection: 'row', marginBottom: 4 },
  bullet_list_icon: { color: '#f97316', fontSize: 14, marginRight: 6, marginTop: 2 },
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
    backgroundColor: '#f9731610',
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
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
  thead: { backgroundColor: '#f973160f' },
  th: {
    padding: 8,
    fontWeight: '700',
    color: '#f97316',
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

export default function ChatScreen() {
  const { settings, userProfile, activities } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setError(null);

    const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
    if (!apiKey) { setError('Add your API key in Settings first.'); return; }

    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const reply = await AIService.chatWithCoach(
        next, settings.llmProvider, apiKey,
        settings.coachPersonality, userProfile, activities
      );
      setMessages([...next, { role: 'assistant', text: reply }]);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Request failed.');
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading, settings, userProfile, activities]);

  const clear = () => { setMessages([]); setError(null); };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapBot]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Bot size={14} color={theme.colors.primary} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          {isUser
            ? <Text style={styles.bubbleUserText}>{item.text}</Text>
            : <Markdown style={markdownStyles}>{item.text}</Markdown>
          }
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Bot size={18} color={theme.colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Coach</Text>
            <Text style={styles.headerSub}>Ask anything about your training</Text>
          </View>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={clear} style={styles.clearBtn}>
            <RefreshCw size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Message list */}
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.emptyHero}>
              <View style={styles.emptyIconBg}>
                <Bot size={36} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Your AI Coach is ready</Text>
              <Text style={styles.emptySub}>Ask about your plans, recovery, pacing, or anything running-related.</Text>
            </View>
            <Text style={styles.suggestLabel}>Suggested questions</Text>
            {SUGGESTIONS.map((s, i) => (
              <TouchableOpacity key={i} style={styles.suggestChip} onPress={() => send(s)}>
                <Text style={styles.suggestText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={loading ? <ThinkingDots /> : null}
          />
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
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
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
          >
            <Send size={18} color={!input.trim() || loading ? theme.colors.textSecondary : '#fff'} />
          </TouchableOpacity>
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f973160f',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#f9731640',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  headerSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  clearBtn: { padding: 8 },

  // Empty state
  emptyContainer: { padding: 24, paddingTop: 32 },
  emptyHero: { alignItems: 'center', marginBottom: 32 },
  emptyIconBg: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#f973160f',
    borderWidth: 1, borderColor: '#f9731640',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  suggestLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  suggestChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  suggestText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },

  // Messages
  list: { padding: 16, paddingBottom: 8 },
  bubbleWrap: { flexDirection: 'row', marginBottom: 14 },
  bubbleWrapUser: { justifyContent: 'flex-end' },
  bubbleWrapBot: { justifyContent: 'flex-start', alignItems: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f973160f',
    borderWidth: 1, borderColor: '#f9731440',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8, marginTop: 2,
  },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  bubbleUserText: { color: '#fff', fontSize: 14, lineHeight: 21 },

  // Thinking dots
  typingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 14 },
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
    fontSize: 14,
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
