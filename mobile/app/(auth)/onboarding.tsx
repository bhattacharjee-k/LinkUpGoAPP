import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput as RNTextInput, ScrollView, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, Button, Chip } from 'react-native-paper';
import { ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react-native';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { SafeBannerAd } from '../../src/components/SafeBannerAd';
import { Redirect } from 'expo-router';
import { useApp } from '../../src/lib/context';
import { api } from '../../src/lib/api';
import { colors } from '../../src/theme';
import {
  City, Budget, Energy, Category, HardNo, DiscoveryStyle, CrowdPreference,
  CITIES, BUDGETS, ENERGIES, CATEGORIES, HARD_NOS, NEIGHBORHOODS,
} from '../../src/lib/store';

const logoImage = require('../../assets/linkupgo-logo.png');

const SCREEN_WIDTH = Dimensions.get('window').width;
const LOGO_WIDTH = SCREEN_WIDTH * 0.7;
const LOGO_HEIGHT = LOGO_WIDTH / 4; // maintain ~4:1 aspect ratio

function Logo() {
  return (
    <View style={{ alignItems: 'center', marginBottom: 36 }}>
      <Image
        source={logoImage}
        style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}
        resizeMode="contain"
      />
    </View>
  );
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export default function Onboarding() {
  const { user, register, login } = useApp();
  const [step, setStep] = useState(1);
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    city: 'NYC' as City,
    budget: ['$$'] as Budget[],
    energy: 'Vibey' as Energy,
    categories: [] as Category[],
    hardNos: [] as string[],
    discoveryStyle: 'mixed' as DiscoveryStyle,
    crowdPreference: 'no_preference' as CrowdPreference,
    favoriteNeighborhoods: [] as string[],
  });

  const checkUsername = useCallback((username: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await api.auth.checkUsername(username);
        setUsernameStatus(result.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('error');
      }
    }, 500);
  }, []);

  // Redirect to tabs once user is authenticated
  if (user) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError('');
      await login(formData.username, formData.password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      setIsLoading(true);
      setError('');
      await register({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        city: formData.city,
        budget: formData.budget,
        energy: formData.energy,
        categories: formData.categories,
        hardNos: formData.hardNos,
        discoveryStyle: formData.discoveryStyle,
        crowdPreference: formData.crowdPreference,
        favoriteNeighborhoods: formData.favoriteNeighborhoods,
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
    else handleRegister();
  };

  const canProceed = () => {
    switch (step) {
      case 1: return formData.username.length >= 3 && formData.password.length >= 6 && formData.name.length >= 1 && usernameStatus === 'available';
      case 2: return true; // city has default
      case 3: return formData.budget.length > 0;
      case 4: return formData.categories.length > 0;
      case 5: return true; // hard nos optional
      case 6: return true; // neighborhoods optional
      default: return false;
    }
  };

  const toggleCategory = (cat: Category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const toggleHardNo = (no: string) => {
    setFormData(prev => ({
      ...prev,
      hardNos: prev.hardNos.includes(no) ? prev.hardNos.filter(n => n !== no) : [...prev.hardNos, no],
    }));
  };

  const toggleNeighborhood = (n: string) => {
    setFormData(prev => ({
      ...prev,
      favoriteNeighborhoods: prev.favoriteNeighborhoods.includes(n)
        ? prev.favoriteNeighborhoods.filter(x => x !== n)
        : [...prev.favoriteNeighborhoods, n],
    }));
  };

  if (isLoginMode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
            <Animated.View entering={FadeIn}>
              <Logo />
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: '700', marginBottom: 8 }}>
                Welcome back
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 32 }}>
                Sign in to continue planning
              </Text>

              {error ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <AlertCircle size={16} color={colors.error} />
                  <Text style={{ color: colors.error, marginLeft: 8 }}>{error}</Text>
                </View>
              ) : null}

              <TextInput
                label="Username"
                value={formData.username}
                onChangeText={(t) => setFormData(p => ({ ...p, username: t }))}
                mode="outlined"
                autoCapitalize="none"
                style={{ marginBottom: 16 }}
                theme={{ colors: { primary: colors.primary } }}
              />
              <TextInput
                label="Password"
                value={formData.password}
                onChangeText={(t) => setFormData(p => ({ ...p, password: t }))}
                mode="outlined"
                secureTextEntry
                style={{ marginBottom: 24 }}
                theme={{ colors: { primary: colors.primary } }}
              />

              <Button
                mode="contained"
                onPress={handleLogin}
                loading={isLoading}
                disabled={isLoading || !formData.username || !formData.password}
                style={{ borderRadius: 12, paddingVertical: 4 }}
                buttonColor={colors.primary}
              >
                Sign In
              </Button>

              <Pressable onPress={() => { setIsLoginMode(false); setError(''); }} style={{ marginTop: 24, alignItems: 'center' }}>
                <Text style={{ color: colors.primary }}>Don't have an account? Sign up</Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Progress bar */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <View
                key={i}
                style={{
                  flex: 1, height: 3, borderRadius: 2,
                  backgroundColor: i <= step ? colors.primary : colors.border,
                }}
              />
            ))}
          </View>
          {step > 1 && (
            <Pressable onPress={() => setStep(step - 1)} style={{ marginTop: 12 }}>
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
          <Animated.View key={step} entering={SlideInRight.duration(300)} exiting={SlideOutLeft.duration(200)}>
            {step === 1 && (
              <View>
                <Logo />
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Create your account
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Set up your profile to get started
                </Text>

                {error ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <AlertCircle size={16} color={colors.error} />
                    <Text style={{ color: colors.error, marginLeft: 8 }}>{error}</Text>
                  </View>
                ) : null}

                <TextInput
                  label="Name"
                  value={formData.name}
                  onChangeText={(t) => setFormData(p => ({ ...p, name: t }))}
                  mode="outlined"
                  style={{ marginBottom: 16 }}
                />
                <TextInput
                  label="Username"
                  value={formData.username}
                  onChangeText={(t) => {
                    setFormData(p => ({ ...p, username: t }));
                    checkUsername(t);
                  }}
                  mode="outlined"
                  autoCapitalize="none"
                  right={
                    usernameStatus === 'checking' ? <TextInput.Icon icon="loading" /> :
                    usernameStatus === 'available' ? <TextInput.Icon icon="check" color={colors.success} /> :
                    usernameStatus === 'taken' ? <TextInput.Icon icon="close" color={colors.error} /> :
                    undefined
                  }
                  style={{ marginBottom: 16 }}
                />
                <TextInput
                  label="Password"
                  value={formData.password}
                  onChangeText={(t) => setFormData(p => ({ ...p, password: t }))}
                  mode="outlined"
                  secureTextEntry
                  style={{ marginBottom: 16 }}
                />
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Where are you based?
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  We'll find the best spots in your city
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {CITIES.map(city => (
                    <Pressable
                      key={city}
                      onPress={() => setFormData(p => ({ ...p, city, favoriteNeighborhoods: [] }))}
                      style={{
                        flex: 1, padding: 20, borderRadius: 16, alignItems: 'center',
                        backgroundColor: formData.city === city ? colors.primary : colors.surface,
                        borderWidth: 1,
                        borderColor: formData.city === city ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{city}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {step === 3 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Budget & Energy
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Your typical vibe for going out
                </Text>

                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Budget</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {BUDGETS.map(b => (
                    <Chip
                      key={b}
                      selected={formData.budget.includes(b)}
                      onPress={() => setFormData(p => ({
                        ...p,
                        budget: p.budget.includes(b) ? p.budget.filter(x => x !== b) : [...p.budget, b],
                      }))}
                      style={{ backgroundColor: formData.budget.includes(b) ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.budget.includes(b) ? colors.primaryForeground : colors.text }}
                    >
                      {b}
                    </Chip>
                  ))}
                </View>

                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Energy</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ENERGIES.map(e => (
                    <Chip
                      key={e}
                      selected={formData.energy === e}
                      onPress={() => setFormData(p => ({ ...p, energy: e }))}
                      style={{ backgroundColor: formData.energy === e ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.energy === e ? colors.primaryForeground : colors.text }}
                    >
                      {e}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {step === 4 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  What do you like?
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Select categories you enjoy
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map(cat => (
                    <Chip
                      key={cat}
                      selected={formData.categories.includes(cat)}
                      onPress={() => toggleCategory(cat)}
                      style={{ backgroundColor: formData.categories.includes(cat) ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.categories.includes(cat) ? colors.primaryForeground : colors.text }}
                    >
                      {cat}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {step === 5 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Any hard no's?
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  We'll avoid these in suggestions
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
                  {HARD_NOS.map(no => (
                    <Chip
                      key={no}
                      selected={formData.hardNos.includes(no)}
                      onPress={() => toggleHardNo(no)}
                      style={{ backgroundColor: formData.hardNos.includes(no) ? colors.error : colors.surface }}
                      textStyle={{ color: formData.hardNos.includes(no) ? '#fff' : colors.text }}
                    >
                      {no}
                    </Chip>
                  ))}
                </View>

                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Discovery Style</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {(['hidden_gems', 'popular', 'mixed'] as DiscoveryStyle[]).map(ds => (
                    <Chip
                      key={ds}
                      selected={formData.discoveryStyle === ds}
                      onPress={() => setFormData(p => ({ ...p, discoveryStyle: ds }))}
                      style={{ backgroundColor: formData.discoveryStyle === ds ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.discoveryStyle === ds ? colors.primaryForeground : colors.text }}
                    >
                      {ds === 'hidden_gems' ? 'Hidden Gems' : ds === 'popular' ? 'Popular Spots' : 'Mix of Both'}
                    </Chip>
                  ))}
                </View>

                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Crowd Preference</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(['quiet', 'buzzing', 'no_preference'] as CrowdPreference[]).map(cp => (
                    <Chip
                      key={cp}
                      selected={formData.crowdPreference === cp}
                      onPress={() => setFormData(p => ({ ...p, crowdPreference: cp }))}
                      style={{ backgroundColor: formData.crowdPreference === cp ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.crowdPreference === cp ? colors.primaryForeground : colors.text }}
                    >
                      {cp === 'quiet' ? 'Quiet' : cp === 'buzzing' ? 'Buzzing' : 'No Preference'}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {step === 6 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
                  Favorite Neighborhoods
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
                  Optional — we'll prioritize these areas
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {NEIGHBORHOODS[formData.city].map(n => (
                    <Chip
                      key={n}
                      selected={formData.favoriteNeighborhoods.includes(n)}
                      onPress={() => toggleNeighborhood(n)}
                      style={{ backgroundColor: formData.favoriteNeighborhoods.includes(n) ? colors.primary : colors.surface }}
                      textStyle={{ color: formData.favoriteNeighborhoods.includes(n) ? colors.primaryForeground : colors.text }}
                    >
                      {n}
                    </Chip>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Bottom action bar */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: 24, paddingBottom: 40,
          backgroundColor: colors.background,
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <Button
            mode="contained"
            onPress={handleNext}
            loading={isLoading}
            disabled={isLoading || !canProceed()}
            icon={({ size, color }) => <ChevronRight size={size} color={color} />}
            contentStyle={{ flexDirection: 'row-reverse', paddingVertical: 4 }}
            style={{ borderRadius: 12 }}
            buttonColor={colors.primary}
          >
            {step === 6 ? 'Create Account' : 'Continue'}
          </Button>

          {step === 1 && (
            <Pressable onPress={() => { setIsLoginMode(true); setError(''); }} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.primary }}>Already have an account? Sign in</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Banner ad at bottom */}
      <View style={{ alignItems: 'center', paddingBottom: 4 }}>
        <SafeBannerAd />
      </View>
    </SafeAreaView>
  );
}
