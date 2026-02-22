import React from 'react';
import { View, Text, FlatList, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Avatar } from 'react-native-paper';
import { ChevronLeft, Copy, Share2, Lock, Plus } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useApp } from '../../src/lib/context';
import { colors } from '../../src/theme';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { groups, sessions, user, isAdmin } = useApp();

  const group = groups.find(g => g.id === id);
  if (!group) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Group not found</Text>
      </SafeAreaView>
    );
  }

  const groupSessions = sessions.filter(s => s.groupId === id);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join "${group.name}" on LinkUpGo! Use code: ${group.inviteCode}`,
      });
    } catch {}
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(`linkupgo://join/${group.inviteCode}`);
    Toast.show({ type: 'success', text1: 'Invite link copied!' });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginLeft: 12 }}>{group.name}</Text>
        {group.locked && <Lock size={16} color={colors.locked} style={{ marginLeft: 8 }} />}
      </View>

      <FlatList
        data={group.memberDetails || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 24 }}
        ListHeaderComponent={
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 16 }}>
              {group.members?.length || 0} members · {groupSessions.length} plans
            </Text>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <Button mode="outlined" onPress={handleShare} icon="share" style={{ flex: 1 }} textColor={colors.text}>
                Share
              </Button>
              <Button mode="outlined" onPress={handleCopy} icon="content-copy" style={{ flex: 1 }} textColor={colors.text}>
                Copy Link
              </Button>
            </View>

            <Button
              mode="contained"
              onPress={() => router.push(`/new-plan?groupId=${group.id}`)}
              icon={({ size, color }) => <Plus size={size} color={color} />}
              style={{ borderRadius: 12, marginBottom: 24 }}
              buttonColor={colors.primary}
            >
              New Plan
            </Button>

            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Members</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Avatar.Text size={40} label={item.name.charAt(0)} style={{ backgroundColor: colors.primary }} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{item.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{item.username}</Text>
            </View>
            {item.id === group.adminId && (
              <View style={{ backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 11 }}>Admin</Text>
              </View>
            )}
          </View>
        )}
        ListFooterComponent={
          groupSessions.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Plans</Text>
              {groupSessions.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(s.status === 'locked' ? `/session-complete/${s.id}` : `/session/${s.id}`)}
                  style={{
                    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{s.name || 'Untitled'}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{s.status}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
