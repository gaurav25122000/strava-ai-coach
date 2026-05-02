import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { CheckCircle, AlertCircle, Info } from 'lucide-react-native';
import { Typography } from './Typography';
import { useStore } from '../store/useStore';
import { theme } from '../theme';

export function GlobalToast() {
  const { toast, setToast } = useStore();

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);

  if (!toast) return null;

  const isError = toast.type === 'error';
  const bgColor = isError ? theme.colors.error || '#EF4444' : theme.colors.success || '#10B981';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View 
        entering={FadeInUp.springify()} 
        exiting={FadeOutUp} 
        style={[styles.container, { backgroundColor: bgColor }]}
      >
        {isError ? <AlertCircle color="#fff" size={20} /> : <CheckCircle color="#fff" size={20} />}
        <Typography style={styles.text}>
          {toast.title ? `${toast.title}: ` : ''}{toast.message}
        </Typography>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60, // safe area top margin
    alignSelf: 'center',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 9999,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8,
    fontSize: 14,
  },
});
