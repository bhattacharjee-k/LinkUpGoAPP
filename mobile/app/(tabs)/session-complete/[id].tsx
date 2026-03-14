import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Chip } from 'react-native-paper';
import { ChevronLeft, Star, MapPin, ExternalLink } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useApp } from '../../../src/lib/context';
import { api } from '../../../src/lib/api';
import { colors } from '../../../src/theme';
import { FeedbackTags } from '@shared/constants';

const FEEDBACK_TAG_LABELS: Record<string, string> = {
  great_vibe: 'Great Vibe',
  too_crowded: 'Too Crowded',
  perfect_price: 'Perfect Price',
  too_expensive: 'Too Expensive',
  good_service: 'Good Service',
  poor_service: 'Poor Service',
  great_food: 'Great Food',
  disappointing_food: 'Disappointing Food',
  easy_to_find: 'Easy to Find',
  hard_to_find: 'Hard to Find',
  would_return: 'Would Return',
  would_not_return: 'Would Not Return',
};

export default function SessionCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getSession, refreshSession } = useApp();

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  const session = getSession(id!);

  useEffect(() => {
    if (id) {
      refreshSession(id);
      loadFeedback();
    }
  }, [id]);

  const loadFeedback = async () => {
    try {
      const fb = await api.feedback.get(id!);
      if (fb) {
        setExistingFeedback(fb);
        setRating(fb.rating);
        setReview(fb.review || '');
        setSelectedTags(fb.tags || []);
      }
    } catch {}
  };

  const winner = session?.suggestions?.find(s => s.id === session.winningOptionId);

  const handleSubmit = async () => {
    if (rating === 0) {
      Toast.show({ type: 'error', text1: 'Please select a rating' });
      return;
    }
    setSubmitting(true);
    try {
      await api.feedback.submit(id!, {
        rating,
        review: review.trim() || undefined,
        tags: selectedTags,
        suggestionId: session?.winningOptionId || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Thanks for your feedback!' });
      setExistingFeedback({ rating, review, tags: selectedTags });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to submit', text2: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {showConfetti && (
        <ConfettiCannon
          count={80}
          origin={{ x: -10, y: 0 }}
          autoStart
          fadeOut
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
        <Pressable onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginLeft: 12 }}>
          Plan Complete
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        {/* Winner card */}
        {winner && (
          <View style={{
            backgroundColor: 'rgba(99,102,241,0.1)',
            borderRadius: 20,
            padding: 24,
            borderWidth: 2,
            borderColor: colors.primary,
            marginBottom: 32,
            alignItems: 'center',
          }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
              THE WINNING SPOT
            </Text>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
              {winner.name}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
              {winner.rating && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Star size={16} color={colors.warning} />
                  <Text style={{ color: colors.textSecondary, fontSize: 14, marginLeft: 4 }}>{winner.rating}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MapPin size={16} color={colors.textMuted} />
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginLeft: 4 }}>{winner.distance}</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{winner.budget}</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
              {winner.description}
            </Text>
          </View>
        )}

        {/* Feedback form */}
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600', marginBottom: 16 }}>
          {existingFeedback ? 'Your Feedback' : 'How was it?'}
        </Text>

        {/* Star rating */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable
              key={n}
              onPress={() => {
                setRating(n);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              disabled={!!existingFeedback}
            >
              <Star
                size={40}
                color={n <= rating ? colors.warning : colors.textMuted}
                fill={n <= rating ? colors.warning : 'transparent'}
              />
            </Pressable>
          ))}
        </View>

        {/* Tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {Object.entries(FEEDBACK_TAG_LABELS).map(([key, label]) => (
            <Chip
              key={key}
              selected={selectedTags.includes(key)}
              onPress={existingFeedback ? undefined : () => {
                setSelectedTags(prev =>
                  prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
                );
              }}
              disabled={!!existingFeedback}
              style={{ backgroundColor: selectedTags.includes(key) ? colors.primary : colors.surface }}
              textStyle={{ color: selectedTags.includes(key) ? colors.primaryForeground : colors.text, fontSize: 13 }}
            >
              {label}
            </Chip>
          ))}
        </View>

        {/* Review */}
        <TextInput
          value={review}
          onChangeText={setReview}
          placeholder="Tell us more (optional)..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          editable={!existingFeedback}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
            color: colors.text,
            fontSize: 15,
            minHeight: 100,
            textAlignVertical: 'top',
            marginBottom: 24,
          }}
        />

        {!existingFeedback && (
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting || rating === 0}
            style={{ borderRadius: 12 }}
            buttonColor={colors.primary}
          >
            Submit Feedback
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
