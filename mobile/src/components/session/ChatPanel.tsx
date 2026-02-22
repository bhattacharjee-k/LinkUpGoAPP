import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Send } from 'lucide-react-native';
import { colors } from '../../theme';

interface Message {
  id: string;
  sender: string;
  senderName?: string;
  text: string;
  createdAt: string;
}

interface Props {
  messages: Message[];
  userId: string;
  onSendMessage: (text: string) => void;
  onSendPlannerMessage: (text: string) => void;
  plannerStreaming?: string;
}

export function ChatPanel({ messages, userId, onSendMessage, onSendPlannerMessage, plannerStreaming }: Props) {
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, plannerStreaming]);

  const handleSend = () => {
    if (!text.trim()) return;
    const msg = text.trim();
    setText('');

    if (msg.toLowerCase().includes('@planner') || msg.toLowerCase().startsWith('planner ')) {
      onSendPlannerMessage(msg);
    } else {
      onSendMessage(msg);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender === userId;
    const isSystem = item.sender === 'system';
    const isPlanner = item.sender === 'planner-ai';

    if (isSystem) {
      return (
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic' }}>{item.text}</Text>
        </View>
      );
    }

    return (
      <View style={{
        alignSelf: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        marginVertical: 4,
      }}>
        {!isMe && (
          <Text style={{ color: isPlanner ? colors.primary : colors.textSecondary, fontSize: 12, marginBottom: 2, fontWeight: '500' }}>
            {isPlanner ? '@Planner' : item.senderName || 'Unknown'}
          </Text>
        )}
        <View style={{
          backgroundColor: isMe ? colors.primary : isPlanner ? 'rgba(99,102,241,0.12)' : colors.surfaceElevated,
          borderRadius: 16,
          borderBottomRightRadius: isMe ? 4 : 16,
          borderBottomLeftRadius: isMe ? 16 : 4,
          padding: 12,
        }}>
          <Text style={{ color: isMe ? '#fff' : colors.text, fontSize: 15, lineHeight: 21 }}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  const allMessages = [...messages];
  if (plannerStreaming) {
    allMessages.push({
      id: 'streaming',
      sender: 'planner-ai',
      senderName: '@Planner',
      text: plannerStreaming,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={120}>
      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={{
        flexDirection: 'row', alignItems: 'center',
        padding: 12, paddingBottom: 24,
        borderTopWidth: 1, borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message or @Planner..."
          placeholderTextColor={colors.textMuted}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 15,
            marginRight: 8,
          }}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable
          onPress={handleSend}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: text.trim() ? colors.primary : colors.surfaceElevated,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Send size={18} color={text.trim() ? '#fff' : colors.textMuted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
