import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Chip } from 'react-native-paper';
import { LogOut, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import Toast from 'react-native-toast-message';
import { useApp } from '../../src/lib/context';
import { colors } from '../../src/theme';
import {
  BUDGETS, ENERGIES, CATEGORIES,
} from '../../src/lib/store';

export default function ProfileScreen() {
  const { user, logout, updateUserProfile, updateUserLocation } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editData, setEditData] = useState({
    budget: user?.budget || ['$$'],
    energy: user?.energy || 'Vibey',
    categories: user?.categories || [],
    favoriteNeighborhoods: user?.favoriteNeighborhoods || [],
  });

  if (!user) return <Redirect href="/(auth)/onboarding" />;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile(editData);
      setIsEditing(false);
      Toast.show({ type: 'success', text1: 'Profile updated' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        await updateUserLocation('', '', 'denied');
        Toast.show({ type: 'info', text1: 'Location permission denied' });
        return;
      }
      const location = await Location.getLastKnownPositionAsync()
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!location) {
        Toast.show({ type: 'error', text1: 'Could not get location' });
        return;
      }
      await updateUserLocation(
        location.coords.latitude.toString(),
        location.coords.longitude.toString(),
        'granted'
      );
      Toast.show({ type: 'success', text1: 'Location updated' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Location error', text2: err.message });
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const toggleCategory = (cat: string) => {
    setEditData(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 120 }}
      >
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
          {user.name}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
          @{user.username} · {user.city}
        </Text>

        {/* Location */}
        <Pressable
          onPress={handleLocation}
          style={{
            backgroundColor: colors.surface, borderRadius: 12, padding: 16,
            flexDirection: 'row', alignItems: 'center', marginBottom: 24,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          <MapPin size={20} color={colors.primary} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Location Sharing</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {user.locationPermission === 'granted' ? 'Enabled' : 'Tap to enable'}
            </Text>
          </View>
        </Pressable>

        {/* Preferences */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Preferences</Text>
          <Button
            mode="text"
            onPress={() => isEditing ? handleSave() : setIsEditing(true)}
            loading={saving}
            textColor={colors.primary}
          >
            {isEditing ? 'Save' : 'Edit'}
          </Button>
        </View>

        {/* Budget */}
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Budget</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {BUDGETS.map(b => (
            <Chip
              key={b}
              selected={isEditing ? editData.budget.includes(b) : user.budget.includes(b)}
              onPress={isEditing ? () => setEditData(prev => ({
                ...prev,
                budget: prev.budget.includes(b) ? prev.budget.filter(x => x !== b) : [...prev.budget, b],
              })) : undefined}
              disabled={!isEditing}
              style={{ backgroundColor: (isEditing ? editData.budget.includes(b) : user.budget.includes(b)) ? colors.primary : colors.surface }}
              textStyle={{ color: (isEditing ? editData.budget.includes(b) : user.budget.includes(b)) ? colors.primaryForeground : colors.text }}
            >
              {b}
            </Chip>
          ))}
        </View>

        {/* Energy */}
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Energy</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {ENERGIES.map(e => (
            <Chip
              key={e}
              selected={isEditing ? editData.energy === e : user.energy === e}
              onPress={isEditing ? () => setEditData(prev => ({ ...prev, energy: e })) : undefined}
              disabled={!isEditing}
              style={{ backgroundColor: (isEditing ? editData.energy === e : user.energy === e) ? colors.primary : colors.surface }}
              textStyle={{ color: (isEditing ? editData.energy === e : user.energy === e) ? colors.primaryForeground : colors.text }}
            >
              {e}
            </Chip>
          ))}
        </View>

        {/* Categories */}
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 8 }}>Interests</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          {CATEGORIES.map(cat => (
            <Chip
              key={cat}
              selected={isEditing ? editData.categories.includes(cat) : user.categories.includes(cat)}
              onPress={isEditing ? () => toggleCategory(cat) : undefined}
              disabled={!isEditing}
              style={{
                backgroundColor: (isEditing ? editData.categories.includes(cat) : user.categories.includes(cat)) ? colors.primary : colors.surface,
              }}
              textStyle={{ color: (isEditing ? editData.categories.includes(cat) : user.categories.includes(cat)) ? colors.primaryForeground : colors.text, fontSize: 13 }}
            >
              {cat}
            </Chip>
          ))}
        </View>

        {/* Logout */}
        <Button
          mode="outlined"
          onPress={handleLogout}
          icon={({ size }) => <LogOut size={size} color={colors.error} />}
          textColor={colors.error}
          style={{ borderColor: colors.error, borderRadius: 12, marginBottom: 40 }}
        >
          Sign Out
        </Button>
      </ScrollView>
    </View>
  );
}
