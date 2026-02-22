import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useApp } from '../../src/lib/context';
import { api } from '../../src/lib/api';
import { colors } from '../../src/theme';

export default function JoinPlanScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user, refreshSessions } = useApp();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !code) return;

    const join = async () => {
      try {
        const result = await api.sessions.join(code);
        await refreshSessions();
        Toast.show({ type: 'success', text1: 'Joined the plan!' });
        router.replace(`/session/${result.id}`);
      } catch (err: any) {
        setError(err.message || 'Failed to join plan');
      }
    };
    join();
  }, [user, code]);

  if (!user) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
      {error ? (
        <Text style={{ color: colors.error, fontSize: 16 }}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 16 }}>Joining plan...</Text>
        </>
      )}
    </SafeAreaView>
  );
}
