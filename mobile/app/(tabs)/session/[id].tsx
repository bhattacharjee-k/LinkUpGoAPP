import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SegmentedButtons, Button } from 'react-native-paper';
import { ChevronLeft, Lock, Settings, Share2, LogOut, MoreVertical, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';
import { useApp, subscribeToSessionMessages, subscribeToVoteUpdates, subscribeToSessionUpdates } from '../../../src/lib/context';
import { api } from '../../../src/lib/api';
import { SuggestionCard } from '../../../src/components/session/SuggestionCard';
import { ChatPanel } from '../../../src/components/session/ChatPanel';
import { colors } from '../../../src/theme';
import { DownvoteReason } from '@shared/constants';

const DOWNVOTE_REASONS = [
  { key: DownvoteReason.TOO_FAR, label: 'Too Far' },
  { key: DownvoteReason.TOO_EXPENSIVE, label: 'Too Expensive' },
  { key: DownvoteReason.BAD_TIMING, label: 'Bad Timing' },
  { key: DownvoteReason.NOT_MY_VIBE, label: 'Not My Vibe' },
  { key: DownvoteReason.NOT_MY_TASTE, label: 'Not My Taste' },
  { key: DownvoteReason.DOESNT_FIT_GROUP, label: "Doesn't Fit Group" },
  { key: DownvoteReason.WRONG_NEIGHBORHOOD, label: 'Wrong Neighborhood' },
  { key: DownvoteReason.OTHER, label: 'Other' },
];

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    user, getSession, refreshSession,
    upvoteForSuggestion, downvoteForSuggestion,
    confirmPlan, addMessage, sendPlannerMessage,
    leaveSession, deleteSession, isAdmin, regenerateSuggestions,
  } = useApp();

  const [tab, setTab] = useState('suggestions');
  const [refreshing, setRefreshing] = useState(false);
  const [plannerStreaming, setPlannerStreaming] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [downvoteTarget, setDownvoteTarget] = useState<string | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const menuSheetRef = useRef<BottomSheet>(null);
  const downvoteSheetRef = useRef<BottomSheet>(null);

  const session = getSession(id!);
  const [loadFailed, setLoadFailed] = useState(false);

  // Real-time subscriptions + retry logic
  useEffect(() => {
    if (!id) return;

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    const tryLoad = async () => {
      try {
        await refreshSession(id);
      } catch (e) {
        console.error('Failed to load session:', e);
      }
    };

    tryLoad();

    // Retry at 2s and 5s if session still not loaded
    retryTimer = setTimeout(async () => {
      if (!getSession(id)) {
        await tryLoad();
        retryTimer = setTimeout(async () => {
          if (!getSession(id)) {
            await tryLoad();
            // After final retry, mark as failed
            setTimeout(() => {
              if (!getSession(id)) setLoadFailed(true);
            }, 3000);
          }
        }, 3000);
      }
    }, 2000);

    const unsubs = [
      subscribeToSessionMessages(id, () => refreshSession(id)),
      subscribeToVoteUpdates(id, () => refreshSession(id)),
      subscribeToSessionUpdates(id, () => refreshSession(id)),
    ];

    return () => {
      clearTimeout(retryTimer);
      unsubs.forEach(fn => fn());
    };
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadFailed(false);
    await refreshSession(id!);
    setRefreshing(false);
  }, [id]);

  if (!session || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {loadFailed ? (
          <>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 8 }}>
              Session not found
            </Text>
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 20 }}>
              This session may have been deleted or you may not have access.
            </Text>
            <Button mode="contained" onPress={() => router.back()} buttonColor={colors.primary} style={{ borderRadius: 12 }}>
              Go Back
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 12 }} />
            <Text style={{ color: colors.textMuted }}>Loading session...</Text>
          </>
        )}
      </SafeAreaView>
    );
  }

  const isLocked = session.status === 'locked';
  const suggestions = session.suggestions || [];
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    const scoreA = Object.values(a.votes || {}).reduce((s, v) => s + (v.voteType === 'up' ? 1 : -1), 0);
    const scoreB = Object.values(b.votes || {}).reduce((s, v) => s + (v.voteType === 'up' ? 1 : -1), 0);
    return scoreB - scoreA;
  });

  const handleUpvote = async (suggestionId: string) => {
    await upvoteForSuggestion(session.id, suggestionId);
  };

  const handleDownvote = (suggestionId: string) => {
    setDownvoteTarget(suggestionId);
    setSelectedReasons([]);
    downvoteSheetRef.current?.expand();
  };

  const submitDownvote = async () => {
    if (!downvoteTarget || selectedReasons.length === 0) return;
    await downvoteForSuggestion(session.id, downvoteTarget, selectedReasons);
    downvoteSheetRef.current?.close();
    setDownvoteTarget(null);
  };

  const handleRemoveVote = async (suggestionId: string) => {
    await api.votes.remove(suggestionId);
    await refreshSession(session.id);
  };

  const handleReplace = async (suggestionId: string) => {
    try {
      await api.suggestions.replace(session.id, suggestionId);
      await refreshSession(session.id);
      Toast.show({ type: 'success', text1: 'Suggestion replaced' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Replace failed', text2: err.message });
    }
  };

  const handleLockPlan = (suggestionId: string) => {
    Alert.alert(
      'Lock In Plan?',
      'This will lock the session and declare a winner. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock In',
          style: 'default',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await confirmPlan(session.id, suggestionId);
            router.replace(`/session-complete/${session.id}`);
          },
        },
      ]
    );
  };

  const handleSendMessage = async (text: string) => {
    await addMessage(session.id, text);
  };

  const [plannerThinking, setPlannerThinking] = useState(false);

  const handleSendPlannerMessage = async (text: string) => {
    setPlannerThinking(true);
    setPlannerStreaming('');
    const { suggestionsUpdated } = await sendPlannerMessage(session.id, text, (chunk) => {
      setPlannerThinking(false);
      setPlannerStreaming(prev => prev + chunk);
    });
    setPlannerThinking(false);
    setPlannerStreaming('');
    if (suggestionsUpdated) {
      Toast.show({ type: 'success', text1: 'Suggestions updated by @Planner' });
    }
  };

  const handleLeave = () => {
    Alert.alert('Leave Session?', 'You can rejoin later via invite link.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          await leaveSession(session.id);
          router.back();
        },
      },
    ]);
  };

  const groupId = session.groupId;
  const isGroupAdmin = isAdmin(groupId);
  const topSuggestion = sortedSuggestions[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Pressable onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
            {session.name || 'Plan'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {session.participants?.length || 0} members · {isLocked ? 'Locked' : session.status}
          </Text>
        </View>
        <Pressable onPress={() => menuSheetRef.current?.expand()}>
          <MoreVertical size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Tab selector */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <SegmentedButtons
          value={tab}
          onValueChange={setTab}
          buttons={[
            { value: 'suggestions', label: `Suggestions (${suggestions.length})` },
            { value: 'chat', label: 'Chat' },
          ]}
          style={{ backgroundColor: colors.surface }}
        />
      </View>

      {/* Content */}
      {tab === 'suggestions' ? (
        <FlatList
          data={sortedSuggestions}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SuggestionCard
              suggestion={item}
              userId={user.id}
              isLocked={isLocked}
              isWinner={item.id === session.winningOptionId}
              index={index}
              onUpvote={() => handleUpvote(item.id)}
              onDownvote={() => handleDownvote(item.id)}
              onRemoveVote={() => handleRemoveVote(item.id)}
              onReplace={isGroupAdmin && !isLocked ? () => handleReplace(item.id) : undefined}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListFooterComponent={
            !isLocked ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Button
                  mode="outlined"
                  onPress={async () => {
                    setRegenerating(true);
                    try {
                      await regenerateSuggestions(session.id);
                      Toast.show({ type: 'success', text1: 'Suggestions regenerated' });
                    } catch (err: any) {
                      Toast.show({ type: 'error', text1: 'Regenerate failed', text2: err.message });
                    } finally {
                      setRegenerating(false);
                    }
                  }}
                  loading={regenerating}
                  disabled={regenerating}
                  icon={({ size }) => <RefreshCw size={size} color={colors.primary} />}
                  style={{ borderRadius: 12, borderColor: colors.primary }}
                  textColor={colors.primary}
                >
                  Regenerate Options
                </Button>
                {isGroupAdmin && topSuggestion && (
                  <Button
                    mode="contained"
                    onPress={() => handleLockPlan(topSuggestion.id)}
                    icon={({ size, color }) => <Lock size={size} color={color} />}
                    style={{ borderRadius: 12 }}
                    buttonColor={colors.primary}
                  >
                    Lock In Top Pick
                  </Button>
                )}
              </View>
            ) : null
          }
        />
      ) : (
        <ChatPanel
          messages={session.messages || []}
          userId={user.id}
          onSendMessage={handleSendMessage}
          onSendPlannerMessage={handleSendPlannerMessage}
          plannerStreaming={plannerStreaming}
          plannerThinking={plannerThinking}
        />
      )}

      {/* Menu Bottom Sheet */}
      <BottomSheet
        ref={menuSheetRef}
        index={-1}
        snapPoints={['35%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
        )}
      >
        <BottomSheetView style={{ padding: 24 }}>
          <Pressable
            onPress={async () => {
              if (session.inviteCode) {
                await Clipboard.setStringAsync(`linkupgo://join-plan/${session.inviteCode}`);
                Toast.show({ type: 'success', text1: 'Invite link copied!' });
              }
              menuSheetRef.current?.close();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}
          >
            <Share2 size={20} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 16, marginLeft: 12 }}>Share Invite Link</Text>
          </Pressable>

          <Pressable
            onPress={() => { menuSheetRef.current?.close(); handleLeave(); }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}
          >
            <LogOut size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 16, marginLeft: 12 }}>Leave Session</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>

      {/* Downvote Reasons Bottom Sheet */}
      <BottomSheet
        ref={downvoteSheetRef}
        index={-1}
        snapPoints={['55%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
        )}
      >
        <BottomSheetView style={{ padding: 24 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 16 }}>
            Why not this one?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {DOWNVOTE_REASONS.map(reason => (
              <Pressable
                key={reason.key}
                onPress={() => {
                  setSelectedReasons(prev =>
                    prev.includes(reason.key) ? prev.filter(r => r !== reason.key) : [...prev, reason.key]
                  );
                }}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: selectedReasons.includes(reason.key) ? 'rgba(239,68,68,0.15)' : colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: selectedReasons.includes(reason.key) ? colors.error : 'transparent',
                }}
              >
                <Text style={{
                  color: selectedReasons.includes(reason.key) ? colors.error : colors.text,
                  fontSize: 14,
                }}>
                  {reason.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            mode="contained"
            onPress={submitDownvote}
            disabled={selectedReasons.length === 0}
            style={{ borderRadius: 12 }}
            buttonColor={colors.error}
          >
            Submit Downvote
          </Button>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}
