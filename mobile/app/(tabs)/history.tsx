import React from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, MapPin, Lock } from 'lucide-react-native';
import { useApp } from '../../src/lib/context';
import { colors } from '../../src/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const { sessions, groups } = useApp();

  const pastSessions = sessions.filter(s => s.status === 'locked');

  const getGroupName = (groupId: string) => groups.find(g => g.id === groupId)?.name || 'Group';
  const getWinner = (session: typeof sessions[0]) =>
    session.suggestions?.find(s => s.id === session.winningOptionId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginLeft: 12 }}>Past Plans</Text>
      </View>

      <FlatList
        data={pastSessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const winner = getWinner(item);
          return (
            <Pressable
              onPress={() => router.push(`/session-complete/${item.id}`)}
              style={{
                backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{getGroupName(item.groupId)}</Text>
                <Lock size={14} color={colors.locked} />
              </View>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 4 }}>
                {item.name || 'Untitled Plan'}
              </Text>
              {winner && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MapPin size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 14, marginLeft: 4 }}>{winner.name}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>No past plans yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
