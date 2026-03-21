import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import mobileAds from 'react-native-google-mobile-ads';
import { AppProvider, useApp } from '../src/lib/context';
import { theme, colors } from '../src/theme';
import { preloadAd } from '../src/lib/ads';
import { registerForPushNotifications, setupNotificationHandler, setupNotificationChannel } from '../src/lib/notifications';

SplashScreen.preventAutoHideAsync();

// Initialize ads: request ATT on iOS, then initialize AdMob and preload
async function initializeAds() {
  try {
    if (Platform.OS === 'ios') {
      await requestTrackingPermissionsAsync();
    }
    await mobileAds().initialize();
    preloadAd();
  } catch (e) {
    console.warn('[Ads] Initialization failed:', e);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

function RootNavigator() {
  const { user, isLoading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
      initializeAds();
      setupNotificationChannel();
    }
  }, [isLoading]);

  // Register for push notifications when user is logged in
  useEffect(() => {
    if (user) {
      registerForPushNotifications().catch(err =>
        console.warn('[Push] Registration failed:', err)
      );
    }
  }, [user]);

  // Handle notification taps for deep linking
  useEffect(() => {
    const cleanup = setupNotificationHandler((url) => {
      // Convert server URL paths to Expo Router paths
      // e.g. /session/abc123 → /session/abc123
      router.push(url as any);
    });
    return cleanup;
  }, []);

  if (isLoading) return null;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <AppProvider>
              <RootNavigator />
              <Toast />
            </AppProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
