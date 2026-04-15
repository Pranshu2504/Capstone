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

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useColors } from './src/hooks/useColors';

import DoorScreen from './src/screens/DoorScreen';
import InterviewScreen from './src/screens/InterviewScreen';
import MirrorScreen from './src/screens/tabs/MirrorScreen';
import WardrobeScreen from './src/screens/tabs/WardrobeScreen';
import LensScreen from './src/screens/tabs/LensScreen';
import CalendarScreen from './src/screens/tabs/CalendarScreen';
import PulseScreen from './src/screens/tabs/PulseScreen';
import IdentityScreen from './src/screens/tabs/IdentityScreen';
import ChatbotScreen from './src/screens/ChatbotScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import ForYouScreen from './src/screens/ForYouScreen';
export type RootStackParamList = {
  Door: undefined;
  Interview: undefined;
  Main: undefined;
  Identity: undefined;
  Chatbot: undefined;
  Friends: undefined;
  ForYou: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

const zoraAvatar = require('./assets/images/zora_avatar.png');

const ChatbotButton = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity 
      style={[styles.chatbotButton, { borderColor: 'rgba(191, 153, 90, 0.4)' }]}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('Chatbot')}
    >
      <Image source={zoraAvatar} style={styles.chatbotAvatar} />
      <Text style={[styles.chatbotText, { color: colors.brass }]}>Ask Zora</Text>
    </TouchableOpacity>
  );
};

function TabNavigator() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: '#777777',
        tabBarStyle: {
          backgroundColor: '#0D0D0D',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#1A1A1A',
          height: Platform.OS === 'android' ? 74 : 84,
          paddingBottom: Platform.OS === 'android' ? 10 : 20,
          paddingTop: 8,
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
        name="pulse"
        component={PulseScreen}
        options={{
          title: 'Pulse',
          tabBarIcon: ({ color }) => <Feather name="activity" size={24} color={color} />,
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
export default function App() {
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
                </Stack.Navigator>
              </NavigationContainer>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
