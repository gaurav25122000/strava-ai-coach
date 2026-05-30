import React, { useEffect } from 'react';
import {
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  View,
  ViewStyle,
  StyleProp,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { X, LucideIcon } from 'lucide-react-native';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { familyStyle, WidgetFamily } from '../../utils/widgetFamilies';
import { styles } from './styles';

const REST_SPRING = { damping: 24, stiffness: 240, mass: 0.9 };

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  family?: WidgetFamily;
  icon?: LucideIcon;
  headerAction?: React.ReactNode;
  maxHeightPct?: number;
  scrollable?: boolean;
  edgeToEdge?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Bottom-sheet primitive. The open/close slide is the Modal's native animation
 * (rock-solid across iOS/Android + the new architecture); on top of that we
 * layer a drag-to-dismiss gesture on the grabber (handle + header) and a
 * backdrop that fades as you drag, so the sheet feels physically attached to
 * the finger. Drag the handle down past ~120px (or flick it) to dismiss;
 * release short of that and it springs back. Tapping the backdrop also closes.
 *
 * NOTE: the entrance is intentionally the native Modal slide rather than a
 * Reanimated shared-value transform — the latter is unreliable inside RN
 * Modals on the new architecture and could leave the sheet stuck off-screen.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  family,
  icon: Icon,
  headerAction,
  maxHeightPct = 88,
  scrollable = true,
  edgeToEdge = false,
  style,
  children,
}: BottomSheetProps) {
  const fam = family ? familyStyle(family) : null;
  const accent = fam?.accent ?? theme.colors.primary;

  // Drag offset, 0 at rest. Only moves while the user drags the grabber.
  const dragY = useSharedValue(0);

  // Reset to rest each time the sheet opens/closes so the native slide always
  // starts and ends from a clean position.
  useEffect(() => {
    dragY.value = 0;
  }, [visible, dragY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.value, [0, 300], [1, 0.15], Extrapolation.CLAMP),
  }));

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, REST_SPRING);
      }
    });

  const grabber = (
    <GestureDetector gesture={pan}>
      <View>
        {fam && (
          <LinearGradient
            colors={fam.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentStrip}
          />
        )}
        <View style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: accent + '55' }]} />
        </View>
        {(title || headerAction) && (
          <View style={styles.header}>
            {Icon && (
              <View style={[styles.iconPill, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
                <Icon size={16} color={accent} />
              </View>
            )}
            <View style={styles.titleWrap}>
              {title && (
                <Typography style={styles.title} numberOfLines={1}>
                  {title}
                </Typography>
              )}
              {subtitle && (
                <Typography style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Typography>
              )}
            </View>
            {headerAction ? (
              <View style={styles.actionWrap}>{headerAction}</View>
            ) : (
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <X size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </GestureDetector>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            scrollable ? { height: `${maxHeightPct}%` } : { maxHeight: `${maxHeightPct}%` },
            style,
            sheetStyle,
          ]}
        >
          {grabber}

          {scrollable ? (
            <ScrollView
              style={styles.scroll}
              bounces={false}
              contentContainerStyle={edgeToEdge ? undefined : styles.scrollContent}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={edgeToEdge ? styles.flexBody : styles.paddedBody}>{children}</View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
