import React from 'react';
import { Platform, StyleSheet, View, TouchableOpacity, Image, Text } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Feather from 'react-native-vector-icons/Feather';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useColors } from '@/hooks/useColors';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

import DoorScreen from '@/screens/DoorScreen';
import InterviewScreen from '@/screens/InterviewScreen';
import MirrorScreen from '@/screens/tabs/MirrorScreen';
import WardrobeScreen from '@/screens/tabs/WardrobeScreen';
import LensScreen from '@/screens/tabs/LensScreen';
import CalendarScreen from '@/screens/tabs/CalendarScreen';

import IdentityScreen from '@/screens/tabs/IdentityScreen';
import ChatbotScreen from '@/screens/ChatbotScreen';
import FriendsScreen from '@/screens/FriendsScreen';
import ForYouScreen from '@/screens/ForYouScreen';
import ClothingCategoryScreen, { ClothingItem } from '@/screens/ClothingCategoryScreen';

export type RootStackParamList = {
  Door: undefined;
  Interview: undefined;
  Main: undefined;
  Identity: undefined;
  Chatbot: undefined;
  Friends: undefined;
  ForYou: undefined;
  ClothingCategory: {
    title: string;
    item: ClothingItem;
    count: number;
    displayType: 'hanger' | 'folded';
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

const zoraAvatar = require('./assets/images/zora_avatar.png');

const ChatbotButton = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  return (
    <TouchableOpacity 
      style={[
        styles.chatbotButton, 
        { 
          backgroundColor: theme === 'dark' ? 'rgba(20, 20, 20, 0.95)' : colors.card,
          borderColor: theme === 'dark' ? 'rgba(201,168,76,0.3)' : colors.border 
        }
      ]}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('Chatbot')}
    >
      <Image source={zoraAvatar} style={styles.chatbotAvatar} />
      <Text style={[styles.chatbotText, { color: colors.primary }]}>Ask Zora</Text>
    </TouchableOpacity>
  );
};

function TabNavigator() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          height: Platform.OS === 'android' ? 74 : 84,
          paddingBottom: Platform.OS === 'android' ? 10 : 20,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_400Regular',
          fontSize: 9,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="mirror"
        component={MirrorScreen}
        options={{
          title: 'Mirror',
          tabBarIcon: ({ color }) => <Feather name="sun" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="wardrobe"
        component={WardrobeScreen}
        options={{
          title: 'Wardrobe',
          tabBarIcon: ({ color }) => <Feather name="grid" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="lens"
        component={LensScreen}
        options={{
          title: 'Lens',
          tabBarIcon: ({ color }) => <Feather name="camera" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="calendar"
        component={CalendarScreen}
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <Feather name="calendar" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="profile"
        component={IdentityScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Feather name="user" size={24} color={color} />,
        }}
      />
    </Tab.Navigator>
    <ChatbotButton />
    </View>
  );
}

const styles = StyleSheet.create({
  chatbotButton: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 95 : 110,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 30,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  chatbotAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  chatbotText: {
    fontFamily: 'Inter_400Regular',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
});
function AppContent() {
  const { isLoaded } = useTheme();

  if (!isLoaded) return null; // Or a splash screen

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <NavigationContainer>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="Door" component={DoorScreen} />
                  <Stack.Screen name="Interview" component={InterviewScreen} />
                  <Stack.Screen name="Main" component={TabNavigator} />
                  <Stack.Screen name="Identity" component={IdentityScreen} options={{ presentation: 'modal' }} />
                  <Stack.Screen name="Chatbot" component={ChatbotScreen} options={{ presentation: 'formSheet' }} />
                  <Stack.Screen name="Friends" component={FriendsScreen} />
                  <Stack.Screen name="ForYou" component={ForYouScreen} />
                  <Stack.Screen name="ClothingCategory" component={ClothingCategoryScreen} />
                </Stack.Navigator>
              </NavigationContainer>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
