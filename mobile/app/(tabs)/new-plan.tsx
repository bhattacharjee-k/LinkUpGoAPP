import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, TextInput as RNTextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Chip, TextInput } from 'react-native-paper';
import { ChevronRight, ChevronLeft, X, Search, Star, MapPin, Sparkles, Navigation, Compass, LocateFixed } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useApp } from '../../src/lib/context';
import { api } from '../../src/lib/api';
import { BannerAdSize } from 'react-native-google-mobile-ads';
import { SafeBannerAd } from '../../src/components/SafeBannerAd';
import { colors } from '../../src/theme';
import { Budget, Energy, Category, BUDGETS, ENERGIES, CATEGORIES, NEIGHBORHOODS, type City } from '../../src/lib/store';

const LOADING_MESSAGES = [
  { icon: Search, text: "Searching the best spots nearby..." },
  { icon: Star, text: "Finding top-rated venues..." },
  { icon: MapPin, text: "Checking what's open and available..." },
  { icon: Sparkles, text: "Curating personalized picks for your group..." },
];

export default function NewPlanScreen() {
  const { startSession, user, groups, createGroup } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();

  const [step, setStep] = useState(1);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(params.groupId || null);
  const [isCreating, setIsCreating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    date: new Date(),
    timeStart: '19:00',
    timeEnd: '22:00',
    locationScope: (user?.city || 'NYC') as City,
    neighborhood: '',
    budget: '$$' as Budget,
    energy: (user?.energy || 'Vibey') as Energy,
    categories: [] as Category[],
    vibeDescription: '',
    locationMode: 'near_me' as 'near_me' | 'explore_anywhere' | 'meet_in_the_middle',
  });

  useEffect(() => {
    if (!isCreating) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isCreating]);

  const handleCreate = async () => {
    if (!selectedGroupId) {
      Toast.show({ type: 'error', text1: 'Select a group first' });
      return;
    }

    setIsCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const sessionId = await startSession(selectedGroupId, {
        ...formData,
        category: formData.categories,
        specificDate: formData.date.toISOString().split('T')[0],
        specificTime: formData.timeStart,
        timeWindow: `${formData.timeStart}-${formData.timeEnd}`,
      }, formData.name);

      router.replace(`/session/${sessionId}`);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to create plan', text2: err.message });
      setIsCreating(false);
    }
  };

  // Loading screen
  if (isCreating) {
    const CurrentIcon = LOADING_MESSAGES[loadingStep].icon;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Top: searching message */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 32, gap: 12 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Searching your right vibe</Text>
            <Animated.View key={loadingStep} entering={FadeIn.duration(400)}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {LOADING_MESSAGES[loadingStep].text}
              </Text>
            </Animated.View>
          </View>
        </View>

        {/* Banner ad during loading */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <SafeBannerAd size={BannerAdSize.MEDIUM_RECTANGLE} />
        </View>
      </SafeAreaView>
    );
  }

  const totalSteps = 4;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
          {step > 1 ? (
            <Pressable onPress={() => setStep(step - 1)}>
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()}>
              <X size={24} color={colors.text} />
            </Pressable>
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Step {step} of {totalSteps}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Progress bar */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 4, marginBottom: 8 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 3, borderRadius: 2,
                backgroundColor: i < step ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
          <Animated.View key={step} entering={SlideInRight.duration(300)} exiting={SlideOutLeft.duration(200)}>
            {step === 1 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Pick your squad
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Who's joining this plan?
                </Text>

                <TextInput
                  label="Plan Name (optional)"
                  value={formData.name}
                  onChangeText={(t) => setFormData(p => ({ ...p, name: t }))}
                  mode="outlined"
                  style={{ marginBottom: 20 }}
                />

                {groups.map(group => (
                  <Pressable
                    key={group.id}
                    onPress={() => setSelectedGroupId(group.id)}
                    style={{
                      backgroundColor: selectedGroupId === group.id ? 'rgba(99,102,241,0.15)' : colors.surface,
                      borderRadius: 12, padding: 16, marginBottom: 8,
                      borderWidth: 2,
                      borderColor: selectedGroupId === group.id ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{group.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                      {group.members?.length || 0} members
                    </Text>
                  </Pressable>
                ))}

                {groups.length === 0 && (
                  <View style={{ alignItems: 'center', padding: 24 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 15 }}>No groups yet</Text>
                    <Button
                      mode="contained"
                      onPress={async () => {
                        const group = await createGroup(`${user?.name}'s Group`);
                        setSelectedGroupId(group.id);
                      }}
                      style={{ marginTop: 12, borderRadius: 12 }}
                      buttonColor={colors.primary}
                    >
                      Create Group
                    </Button>
                  </View>
                )}
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  When & Where
                </Text>

                {/* Date */}
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8, marginTop: 16 }}>Date</Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    backgroundColor: colors.surface, borderRadius: 12, padding: 16,
                    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 16 }}>
                    {formData.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={formData.date}
                    mode="date"
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      setShowDatePicker(false);
                      if (date) setFormData(p => ({ ...p, date }));
                    }}
                    themeVariant="dark"
                  />
                )}

                {/* Location Mode */}
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8, marginTop: 8 }}>Location Mode</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[
                    { key: 'near_me', label: 'Near Me', icon: LocateFixed },
                    { key: 'explore_anywhere', label: 'Explore', icon: Compass },
                  ].map(({ key, label, icon: Icon }) => (
                    <Pressable
                      key={key}
                      onPress={() => setFormData(p => ({ ...p, locationMode: key as any }))}
                      style={{
                        flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
                        backgroundColor: formData.locationMode === key ? 'rgba(99,102,241,0.15)' : colors.surface,
                        borderWidth: 1,
                        borderColor: formData.locationMode === key ? colors.primary : colors.border,
                      }}
                    >
                      <Icon size={20} color={formData.locationMode === key ? colors.primary : colors.textMuted} />
                      <Text style={{ color: formData.locationMode === key ? colors.primary : colors.text, fontSize: 13, marginTop: 4, fontWeight: '500' }}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* City */}
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>City</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {(['NYC', 'Chicago'] as City[]).map(city => (
                    <Pressable
                      key={city}
                      onPress={() => setFormData(p => ({ ...p, locationScope: city, neighborhood: '' }))}
                      style={{
                        flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
                        backgroundColor: formData.locationScope === city ? colors.primary : colors.surface,
                        borderWidth: 1,
                        borderColor: formData.locationScope === city ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ color: formData.locationScope === city ? colors.primaryForeground : colors.text, fontSize: 15, fontWeight: '500' }}>{city}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Neighborhood */}
                {formData.locationMode !== 'explore_anywhere' && (
                  <>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Neighborhood (optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {NEIGHBORHOODS[formData.locationScope].map(n => (
                          <Chip
                            key={n}
                            showSelectedCheck={false}
                            selected={formData.neighborhood === n}
                            onPress={() => setFormData(p => ({ ...p, neighborhood: p.neighborhood === n ? '' : n }))}
                            style={{ backgroundColor: formData.neighborhood === n ? colors.primary : colors.surface }}
                            textStyle={{ color: formData.neighborhood === n ? colors.primaryForeground : colors.text, fontSize: 13 }}
                          >
                            {n}
                          </Chip>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            )}

            {step === 3 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  What's the vibe?
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Set the mood for your outing
                </Text>

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Budget</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                  {BUDGETS.map(b => (
                    <Pressable
                      key={b}
                      onPress={() => setFormData(p => ({ ...p, budget: b }))}
                      style={{
                        flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
                        backgroundColor: formData.budget === b ? colors.primary : colors.surface,
                        borderWidth: 1,
                        borderColor: formData.budget === b ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{b}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Energy</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {ENERGIES.map(e => (
                    <Chip
                      key={e}
                      showSelectedCheck={false}
                      selected={formData.energy === e}
                      onPress={() => setFormData(p => ({ ...p, energy: e }))}
                      style={{ backgroundColor: formData.energy === e ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.energy === e ? colors.primaryForeground : colors.text }}
                    >
                      {e}
                    </Chip>
                  ))}
                </View>

                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Categories</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map(cat => (
                    <Chip
                      key={cat}
                      showSelectedCheck={false}
                      selected={formData.categories.includes(cat)}
                      onPress={() => {
                        setFormData(p => ({
                          ...p,
                          categories: p.categories.includes(cat)
                            ? p.categories.filter(c => c !== cat)
                            : [...p.categories, cat],
                        }));
                      }}
                      style={{ backgroundColor: formData.categories.includes(cat) ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.categories.includes(cat) ? colors.primaryForeground : colors.text, fontSize: 13 }}
                    >
                      {cat}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {step === 4 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Anything else?
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Optional — describe the vibe you're going for
                </Text>

                <TextInput
                  label="Vibe description"
                  value={formData.vibeDescription}
                  onChangeText={(t) => setFormData(p => ({ ...p, vibeDescription: t }))}
                  mode="outlined"
                  multiline
                  numberOfLines={4}
                  placeholder="e.g. Rooftop bar with good cocktails, live jazz..."
                  style={{ marginBottom: 24 }}
                />

                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
                  You're all set! Tap Create to find the perfect plan.
                </Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Bottom action */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: 24, paddingBottom: 40,
          backgroundColor: colors.background,
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          {step < totalSteps ? (
            <Button
              mode="contained"
              onPress={() => setStep(step + 1)}
              disabled={step === 1 && !selectedGroupId}
              icon={({ size, color }) => <ChevronRight size={size} color={color} />}
              contentStyle={{ flexDirection: 'row-reverse', paddingVertical: 4 }}
              style={{ borderRadius: 12 }}
              buttonColor={colors.primary}
            >
              Continue
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={handleCreate}
              icon={({ size, color }) => <Sparkles size={size} color={color} />}
              contentStyle={{ paddingVertical: 4 }}
              style={{ borderRadius: 12 }}
              buttonColor={colors.primary}
            >
              Create Plan
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
