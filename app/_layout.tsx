import { MaterialIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { BrandEntrance } from '../components/BrandEntrance';
import { colors } from '../design/tokens';
import { duration } from '../design/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDiscoveryStore } from '../features/discovery/useDiscoveryStore';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../features/auth/useAuthStore';
import { dismissActiveFocus } from '../utils/webFocus';

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  const profileHydrated = useUserStore((state) => state.profileHydrated);
  const hydrateProfile = useUserStore((state) => state.hydrateProfile);
  const hydrateSavedListings = useDiscoveryStore((state) => state.hydrateSavedListings);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const [fontsLoaded] = useFonts({
    ...MaterialIcons.font,
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
  });

  useEffect(() => {
    void Promise.all([hydrateProfile(), hydrateSavedListings()]).then(() => initializeAuth());
  }, [hydrateProfile, hydrateSavedListings, initializeAuth]);

  // Static web render에서는 effect가 실행되지 않는다. web을 hydration gate로 막으면 모든 route가 빈 shell로 export된다.
  if (!fontsLoaded || (Platform.OS !== 'web' && !profileHydrated)) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenListeners={{
          blur: dismissActiveFocus,
          beforeRemove: dismissActiveFocus,
        }}
        screenOptions={{
          animation: reducedMotion ? 'none' : 'fade_from_bottom',
          animationDuration: duration.screen,
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="intro" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="future" options={{ headerShown: false }} />
        <Stack.Screen name="quiz" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="calendar" options={{ headerShown: false }} />
        <Stack.Screen name="newlywed" options={{ headerShown: false }} />
        <Stack.Screen name="benchmark" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="discovery/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="eligibility/first-home" options={{ headerShown: false }} />
        <Stack.Screen name="eligibility/newlywed" options={{ headerShown: false }} />
      </Stack>
      <BrandEntrance />
    </>
  );
}
