import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useColors } from '@/hooks/useColors';

export default function ChatbotScreen() {
  const navigation = useNavigation();
  const colors = useColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0D0D0D' }]}>
      <View style={[styles.header, { borderBottomColor: '#1A1A1A' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="chevron-down" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Zora</Text>
        <View style={styles.placeholderButton} />
      </View>

      <View style={styles.content}>
        <View style={[styles.messageBubble, { backgroundColor: '#1A1A1A', borderColor: 'rgba(191, 153, 90, 0.4)' }]}>
          <Text style={[styles.messageText, { color: colors.text }]}>
            Hi! I am Zora, your personal fashion assistant. How can I help you style your outfit today?
          </Text>
        </View>
        <Text style={[styles.dummyInfo, { color: '#777777' }]}>
          (This is a dummy chat screen. Interactive chat features coming soon.)
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 16 : 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  placeholderButton: {
    width: 36,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'flex-start',
  },
  messageBubble: {
    padding: 16,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    marginBottom: 20,
    maxWidth: '85%',
  },
  messageText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  dummyInfo: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: 20,
    fontStyle: 'italic',
  },
});
