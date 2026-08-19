import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from './src/screens/LoginScreen';
import { OsListScreen } from './src/screens/OsListScreen';
import { OsDetailScreen } from './src/screens/OsDetailScreen';
import { OsCloseScreen } from './src/screens/OsCloseScreen';
import { ClientSearchScreen } from './src/screens/ClientSearchScreen';
import { OfflineClientsScreen } from './src/screens/OfflineClientsScreen';
import { AuthorizeOnuScreen } from './src/screens/AuthorizeOnuScreen';
import { ChamadoItem } from './src/types/sgp';

export type RootStackParamList = {
  Login: undefined;
  OsList: undefined;
  OsDetail: { chamado: ChamadoItem };
  OsClose: { osId: number };
  ClientSearch: undefined;
  OfflineClients: undefined;
  AuthorizeOnu: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Launch Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Ops! Algo deu errado ao carregar.</Text>
          <Text style={styles.errorSub}>
            {this.state.error?.message || 'Erro inesperado no sistema.'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryBtnText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={true} />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="OsList"
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              contentStyle: { backgroundColor: '#0B0F17' },
            }}
          >
            <Stack.Screen name="Login">
              {({ navigation }) => (
                <LoginScreen onLoginSuccess={() => navigation.replace('OsList')} />
              )}
            </Stack.Screen>

            <Stack.Screen name="OsList">
              {({ navigation }) => (
                <OsListScreen
                  onOsClick={(chamado) => navigation.navigate('OsDetail', { chamado })}
                  onOpenClientSearch={() => navigation.navigate('ClientSearch')}
                  onOpenOfflineClients={() => navigation.navigate('OfflineClients')}
                  onOpenAuthorizeOnu={() => navigation.navigate('AuthorizeOnu')}
                  onLogout={() => navigation.replace('Login')}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="ClientSearch">
              {({ navigation }) => (
                <ClientSearchScreen
                  onBackToOs={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="OfflineClients">
              {({ navigation }) => (
                <OfflineClientsScreen
                  onBackToOs={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="AuthorizeOnu">
              {({ navigation }) => (
                <AuthorizeOnuScreen
                  onBackToOs={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="OsDetail">
              {({ navigation, route }) => (
                <OsDetailScreen
                  chamado={route.params.chamado}
                  onBack={() => navigation.goBack()}
                  onCloseOsClick={(osId) => navigation.navigate('OsClose', { osId })}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="OsClose">
              {({ navigation, route }) => (
                <OsCloseScreen
                  osId={route.params.osId}
                  onBack={() => navigation.goBack()}
                  onFinishSuccess={() => navigation.navigate('OsList')}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0B0F17',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorSub: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
});
