import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, RefreshControl, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Button, Badge, Avatar } from 'react-native-paper';
import { Plus, MapPin, ArrowRight, Lock, Copy, Check, Clock, Bell } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useApp } from '../../src/lib/context';
import { colors } from '../../src/theme';

export default function HomeScreen() {
  const { user, sessions, groups, isAdmin } = useApp();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { refreshGroups, refreshSessions } = useApp();
  const squadSheetRef = useRef<BottomSheet>(null);
  const [selectedSquad, setSelectedSquad] = useState<typeof groups[0] | null>(null);
  const [copied, setCopied] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshGroups(), refreshSessions()]);
    setRefreshing(false);
  }, []);

  if (!user) return <Redirect href="/(auth)/onboarding" />;

  const activeSessions = sessions.filter(s => s.status !== 'locked');
  const pastSessions = sessions.filter(s => s.status === 'locked');

  const getGroupName = (groupId: string) => {
    return groups.find(g => g.id === groupId)?.name || 'Group';
  };

  const handleCopyLink = async (inviteCode: string) => {
    await Clipboard.setStringAsync(`linkupgo://join/${inviteCode}`);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (inviteCode: string, groupName: string) => {
    try {
      await Share.share({
        message: `Join my group "${groupName}" on LinkUpGo! Use code: ${inviteCode}`,
      });
    } catch {}
  };

  const openSquadDrawer = (group: typeof groups[0]) => {
    setSelectedSquad(group);
    squadSheetRef.current?.expand();
  };

  const getWinningSuggestion = (session: typeof sessions[0]) => {
    if (!session.winningOptionId || !session.suggestions) return null;
    return session.suggestions.find(s => s.id === session.winningOptionId) || null;
  };

  const renderSessionCard = ({ item: session }: { item: typeof sessions[0] }) => {
    const isLocked = session.status === 'locked';
    const winner = isLocked ? getWinningSuggestion(session) : null;

    return (
      <Pressable
        onPress={() => {
          if (isLocked) {
            router.push(`/session-complete/${session.id}`);
          } else {
            router.push(`/session/${session.id}`);
          }
        }}
        style={{
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {getGroupName(session.groupId)}
          </Text>
          <View style={{
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
            backgroundColor: isLocked ? 'rgba(245,158,11,0.15)' :
              session.status === 'voting' ? 'rgba(99,102,241,0.15)' : 'rgba(163,163,163,0.15)',
          }}>
            <Text style={{
              fontSize: 11, fontWeight: '600',
              color: isLocked ? colors.locked : session.status === 'voting' ? colors.primary : colors.textMuted,
            }}>
              {isLocked ? 'LOCKED' : session.status === 'voting' ? 'VOTING' : 'DRAFT'}
            </Text>
          </View>
        </View>

        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
          {session.name || 'Untitled Plan'}
        </Text>

        {winner && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <MapPin size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 14, marginLeft: 4, fontWeight: '500' }}>
              {winner.name}
            </Text>
          </View>
        )}

        {!isLocked && session.suggestions?.length > 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            {session.suggestions.length} suggestions · {session.participants?.length || 0} members
          </Text>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
          <ArrowRight size={16} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  };

  const renderGroupCard = ({ item: group }: { item: typeof groups[0] }) => (
    <Pressable
      onPress={() => openSquadDrawer(group)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        marginRight: 12,
        width: 160,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }} numberOfLines={1}>
        {group.name}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        {group.members?.length || 0} members
      </Text>
      {group.locked && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Lock size={12} color={colors.locked} />
          <Text style={{ color: colors.locked, fontSize: 11, marginLeft: 4 }}>Locked</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <FlatList
        data={activeSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionCard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>
                  Hey, {user.name}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/history')}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Clock size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* New Plan Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/new-plan');
              }}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 16,
                padding: 20,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 32,
              }}
            >
              <Plus size={20} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontSize: 17, fontWeight: '600', marginLeft: 8 }}>
                New Plan
              </Text>
            </Pressable>

            {/* Squads */}
            {groups.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
                  Your Squads
                </Text>
                <FlatList
                  data={groups}
                  keyExtractor={(item) => item.id}
                  renderItem={renderGroupCard}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                />
              </View>
            )}

            {/* Active plans header */}
            {activeSessions.length > 0 && (
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
                Active Plans
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>No active plans yet</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>
              Tap "New Plan" to get started!
            </Text>
          </View>
        }
        ListFooterComponent={
          pastSessions.length > 0 ? (
            <Pressable onPress={() => router.push('/history')} style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>
                View {pastSessions.length} past plan{pastSessions.length > 1 ? 's' : ''}
              </Text>
            </Pressable>
          ) : null
        }
      />

      {/* Squad Bottom Sheet */}
      <BottomSheet
        ref={squadSheetRef}
        index={-1}
        snapPoints={['50%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
        )}
      >
        <BottomSheetView style={{ padding: 24 }}>
          {selectedSquad && (
            <>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 }}>
                {selectedSquad.name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 20 }}>
                {selectedSquad.members?.length || 0} members
              </Text>

              {/* Members */}
              {selectedSquad.memberDetails?.map(member => (
                <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Avatar.Text size={36} label={member.name.charAt(0)} style={{ backgroundColor: colors.primary }} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{member.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{member.username}</Text>
                  </View>
                  {member.id === selectedSquad.adminId && (
                    <View style={{ marginLeft: 'auto', backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ color: colors.primary, fontSize: 11 }}>Admin</Text>
                    </View>
                  )}
                </View>
              ))}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <Button
                  mode="outlined"
                  onPress={() => handleShare(selectedSquad.inviteCode, selectedSquad.name)}
                  icon="share"
                  style={{ flex: 1 }}
                  textColor={colors.text}
                >
                  Share
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => handleCopyLink(selectedSquad.inviteCode)}
                  icon={copied ? "check" : "content-copy"}
                  style={{ flex: 1 }}
                  textColor={colors.text}
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </Button>
              </View>

              <Button
                mode="contained"
                onPress={() => {
                  squadSheetRef.current?.close();
                  router.push(`/new-plan?groupId=${selectedSquad.id}`);
                }}
                style={{ marginTop: 12, borderRadius: 12 }}
                buttonColor={colors.primary}
              >
                Start Plan with {selectedSquad.name}
              </Button>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}
