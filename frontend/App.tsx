import React from 'react';
import { Platform, StyleSheet, View, TouchableOpacity } from 'react-native';
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

export type RootStackParamList = {
  Door: undefined;
  Interview: undefined;
  Main: undefined;
  Identity: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

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
    </View>
  );
}

// Styles removed as they are no longer needed

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
                </Stack.Navigator>
              </NavigationContainer>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
