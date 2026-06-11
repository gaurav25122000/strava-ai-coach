import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { Typography } from '../Typography';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional header rendered above the content, under the grabber. */
  title?: string;
  /** Muted line under the title. */
  caption?: string;
  /**
   * Content scrolls when it outgrows the max height. The sheet itself is
   * always content-sized — a 3-row info sheet stays a 3-row sheet.
   */
  scrollable?: boolean;
  /** Cap as a fraction of the window (default 0.9). */
  maxHeightFraction?: number;
  children: React.ReactNode;
}

const DISMISS_DRAG = 120;
const DISMISS_VELOCITY = 800;
const EXIT_MS = 220;

/**
 * App-wide bottom sheet: content-adaptive height (never a fixed 88% takeover),
 * physical spring, fading backdrop, drag-to-dismiss. Implemented on the core
 * RN Modal + reanimated — @gorhom/bottom-sheet 5.2.x silently fails to present
 * under reanimated 4 / Fabric, so we own the whole behavior here.
 */
export function Sheet({
  visible,
  onClose,
  title,
  caption,
  scrollable = false,
  maxHeightFraction = 0.9,
  children,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  // The Modal stays mounted through the exit animation, then unmounts.
  const [mounted, setMounted] = useState(visible);
  const closing = useRef(false);

  const ty = useSharedValue(windowH);
  const backdrop = useSharedValue(0);
  const measuredH = useRef(windowH);

  const finishClose = useCallback(() => {
    setMounted(false);
    closing.current = false;
    onClose();
  }, [onClose]);

  // Single exit path for backdrop tap, drag, Android back, and visible=false.
  const startClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    backdrop.value = withTiming(0, { duration: EXIT_MS });
    ty.value = withTiming(measuredH.current, { duration: EXIT_MS }, (done) => {
      if (done) runOnJS(finishClose)();
    });
  }, [backdrop, ty, finishClose]);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      ty.value = windowH;
      backdrop.value = 0;
      setMounted(true);
    } else if (mounted && !closing.current) {
      startClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Slide in once the panel knows its height; re-measure keeps drag-dismiss
  // distance honest when content changes while open.
  const onPanelLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      measuredH.current = e.nativeEvent.layout.height;
      if (!closing.current && visible) {
        ty.value = Math.min(ty.value, measuredH.current);
        ty.value = withSpring(0, theme.motion.spring);
        backdrop.value = withTiming(1, { duration: theme.motion.base });
      }
    },
    [backdrop, ty, visible],
  );

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Follow the finger down; gentle resistance upward.
      ty.value = e.translationY > 0 ? e.translationY : e.translationY / 12;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(startClose)();
      } else {
        ty.value = withSpring(0, theme.motion.spring);
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));
  // scrim token already carries its own alpha; backdrop.value just fades it.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  if (!mounted) return null;

  const header = (
    <View>
      <View style={styles.grabberRow}>
        <View style={styles.grabber} />
      </View>
      {title ? (
        <View style={styles.header}>
          <Typography style={styles.title}>{title}</Typography>
          {caption ? <Typography style={styles.caption}>{caption}</Typography> : null}
        </View>
      ) : null}
    </View>
  );

  const bottomPad = { paddingBottom: insets.bottom + 16 };

  return (
    <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={startClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={startClose} accessibilityLabel="Close sheet" />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.panel, { maxHeight: windowH * maxHeightFraction }, panelStyle]}
            onLayout={onPanelLayout}
          >
            {scrollable ? (
              <>
                <GestureDetector gesture={pan}>{header}</GestureDetector>
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={bottomPad}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>
              </>
            ) : (
              <GestureDetector gesture={pan}>
                <View>
                  {header}
                  <View style={[styles.body, bottomPad]}>{children}</View>
                </View>
              </GestureDetector>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: theme.colors.scrim,
  },
  avoider: {
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabber: {
    backgroundColor: theme.colors.border,
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  body: {
    paddingHorizontal: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  title: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  caption: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: 3,
  },
});
