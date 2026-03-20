import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { MapPin, Star, DollarSign, ThumbsUp, ThumbsDown, ExternalLink, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors } from '../../theme';
import type { Suggestion } from '../../lib/context';

interface Props {
  suggestion: Suggestion;
  userId: string;
  isLocked: boolean;
  isWinner: boolean;
  index: number;
  onUpvote: () => void;
  onDownvote: () => void;
  onRemoveVote: () => void;
  onReplace?: () => void;
}

export function SuggestionCard({
  suggestion, userId, isLocked, isWinner, index,
  onUpvote, onDownvote, onRemoveVote, onReplace,
}: Props) {
  const myVote = suggestion.votes?.[userId];
  const upvotes = Object.values(suggestion.votes || {}).filter(v => v.voteType === 'up').length;
  const downvotes = Object.values(suggestion.votes || {}).filter(v => v.voteType === 'down').length;
  const score = upvotes - downvotes;

  const handleUpvote = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (myVote?.voteType === 'up') {
      onRemoveVote();
    } else {
      onUpvote();
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
      <View style={{
        backgroundColor: isWinner ? 'rgba(99,102,241,0.1)' : colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: isWinner ? 2 : 1,
        borderColor: isWinner ? colors.primary : colors.border,
      }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }} numberOfLines={2}>
              {suggestion.name}
            </Text>
            {suggestion.venueName && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                at {suggestion.venueName}
              </Text>
            )}
          </View>
          {isWinner && (
            <View style={{ backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>WINNER</Text>
            </View>
          )}
          {isLocked && !isWinner && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: colors.locked, fontSize: 11, fontWeight: '700' }}>LOCKED</Text>
            </View>
          )}
        </View>

        {/* Meta row */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
          {suggestion.rating && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Star size={14} color={colors.warning} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 4 }}>{suggestion.rating}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MapPin size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 4 }}>{suggestion.distance}</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{suggestion.budget}</Text>
        </View>

        {/* Description */}
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 8 }} numberOfLines={3}>
          {suggestion.description}
        </Text>

        {/* Why explanation */}
        {suggestion.whyExplanation && (
          <View style={{ backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontStyle: 'italic' }}>
              {suggestion.whyExplanation}
            </Text>
          </View>
        )}

        {/* Tags */}
        {suggestion.tags?.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {suggestion.tags.slice(0, 4).map(tag => (
              <View key={tag} style={{ backgroundColor: colors.surfaceElevated, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Links */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Pressable
            onPress={() => {
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suggestion.name + (suggestion.venueName ? ' ' + suggestion.venueName : ''))}`;
              Linking.openURL(mapsUrl);
            }}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <MapPin size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, marginLeft: 4 }}>More Info</Text>
          </Pressable>
          {suggestion.reservationUrl && (
            <Pressable onPress={() => Linking.openURL(suggestion.reservationUrl!)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ExternalLink size={14} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 13, marginLeft: 4 }}>Reserve</Text>
            </Pressable>
          )}
        </View>

        {/* Voting */}
        {!isLocked && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={handleUpvote}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: myVote?.voteType === 'up' ? 'rgba(34,197,94,0.15)' : colors.surfaceElevated,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                }}
              >
                <ThumbsUp size={16} color={myVote?.voteType === 'up' ? colors.upvote : colors.textMuted} />
                <Text style={{ color: myVote?.voteType === 'up' ? colors.upvote : colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
                  {upvotes}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (myVote?.voteType === 'down') {
                    onRemoveVote();
                  } else {
                    onDownvote();
                  }
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: myVote?.voteType === 'down' ? 'rgba(239,68,68,0.15)' : colors.surfaceElevated,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                }}
              >
                <ThumbsDown size={16} color={myVote?.voteType === 'down' ? colors.downvote : colors.textMuted} />
                <Text style={{ color: myVote?.voteType === 'down' ? colors.downvote : colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
                  {downvotes}
                </Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Score: {score}</Text>
              {onReplace && (
                <Pressable onPress={onReplace} style={{ padding: 8 }}>
                  <RefreshCw size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
