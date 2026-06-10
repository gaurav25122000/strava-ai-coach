import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
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

/**
 * App-wide bottom sheet: content-adaptive height (never a fixed 88% takeover),
 * physical spring, fading backdrop, body drag-to-dismiss. Built on
 * @gorhom/bottom-sheet modal + dynamic sizing; requires the
 * BottomSheetModalProvider mounted in App.tsx.
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
  const ref = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  useEffect(() => {
    if (visible) {
      ref.current?.present();
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      ref.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.62}
        pressBehavior="close"
      />
    ),
    [],
  );

  const header = useMemo(() => {
    if (!title) return null;
    return (
      <View style={styles.header}>
        <Typography style={styles.title}>{title}</Typography>
        {caption ? <Typography style={styles.caption}>{caption}</Typography> : null}
      </View>
    );
  }, [title, caption]);

  const Body = scrollable ? BottomSheetScrollView : BottomSheetView;

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      maxDynamicContentSize={windowH * maxHeightFraction}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.grabber}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <Body
        style={styles.body}
        {...(scrollable ? { contentContainerStyle: { paddingBottom: insets.bottom + 16 } } : {})}
      >
        {header}
        {scrollable ? children : <View style={{ paddingBottom: insets.bottom + 16 }}>{children}</View>}
      </Body>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  grabber: {
    backgroundColor: theme.colors.border,
    width: 40,
    height: 4,
  },
  body: {
    paddingHorizontal: 20,
  },
  header: {
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
