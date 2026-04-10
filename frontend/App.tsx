import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

function TabNavigator() {
  const colors = useColors();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: '#333333',
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
          tabBarIcon: ({ color }) => <Feather name="sun" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="wardrobe"
        component={WardrobeScreen}
        options={{
          title: 'Wardrobe',
          tabBarIcon: ({ color }) => <Feather name="grid" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="lens"
        component={LensScreen}
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={[lensStyles.center, { backgroundColor: colors.brass }]}>
              <Feather name="camera" size={22} color="#0A0A0A" />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="calendar"
        component={CalendarScreen}
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="pulse"
        component={PulseScreen}
        options={{
          title: 'Pulse',
          tabBarIcon: ({ color }) => <Feather name="activity" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="identity"
        component={IdentityScreen}
        options={{
          title: 'Me',
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const lensStyles = StyleSheet.create({
  center: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
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
                </Stack.Navigator>
              </NavigationContainer>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
