import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions and get the Expo push token.
 * Registers the token with the server.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for push notifications');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '9d21934b-8928-42d3-8ea6-08e21a16e4d8', // from app.json > extra > eas > projectId
    });
    const token = tokenData.data;

    // Register with server
    await api.users.registerPushToken(token);
    console.log('[Push] Token registered:', token);

    return token;
  } catch (error) {
    console.error('[Push] Failed to get push token:', error);
    return null;
  }
}

/**
 * Set up notification response handler for deep linking
 */
export function setupNotificationHandler(navigate: (url: string) => void): () => void {
  // Handle notification taps (app was in background/killed)
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const url = response.notification.request.content.data?.url;
    if (url && typeof url === 'string') {
      navigate(url);
    }
  });

  return () => subscription.remove();
}

/**
 * Set up Android notification channel
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#B6FF2E',
    });
  }
}
