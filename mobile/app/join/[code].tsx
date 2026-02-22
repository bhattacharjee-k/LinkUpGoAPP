import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useApp } from '../../src/lib/context';
import { colors } from '../../src/theme';

export default function JoinGroupScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user, joinGroupByCode } = useApp();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !code) return;

    const join = async () => {
      try {
        const group = await joinGroupByCode(code);
        Toast.show({ type: 'success', text1: `Joined ${group.name}!` });
        router.replace('/');
      } catch (err: any) {
        setError(err.message || 'Failed to join group');
      }
    };
    join();
  }, [user, code]);

  if (!user) {
    // Will be redirected to auth by root layout
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
      {error ? (
        <Text style={{ color: colors.error, fontSize: 16 }}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 16 }}>Joining group...</Text>
        </>
      )}
    </SafeAreaView>
  );
}
