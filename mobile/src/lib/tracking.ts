import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { Platform } from 'react-native';

let permissionChecked = false;

export async function requestTrackingPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios' || permissionChecked) return true;

  try {
    const { status: currentStatus } = await getTrackingPermissionsAsync();
    if (currentStatus === 'granted') {
      permissionChecked = true;
      return true;
    }
    if (currentStatus === 'denied') {
      permissionChecked = true;
      return false;
    }

    const { status } = await requestTrackingPermissionsAsync();
    permissionChecked = true;
    return status === 'granted';
  } catch {
    permissionChecked = true;
    return false;
  }
}
