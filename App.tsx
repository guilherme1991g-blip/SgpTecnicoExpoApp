import React, { Component, ErrorInfo, ReactNode, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, Alert, AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { checkIsSessionRevoked, logoutLoggedTecnico } from './src/services/webhookService';

import { LoginScreen } from './src/screens/LoginScreen';
import { OsListScreen } from './src/screens/OsListScreen';
import { OsDetailScreen } from './src/screens/OsDetailScreen';
import { OsCloseScreen } from './src/screens/OsCloseScreen';
import { ClientSearchScreen } from './src/screens/ClientSearchScreen';
import { OfflineClientsScreen } from './src/screens/OfflineClientsScreen';
import { AuthorizeOnuScreen } from './src/screens/AuthorizeOnuScreen';
import { OltConsultationScreen } from './src/screens/OltConsultationScreen';
import { FacialLoginScreen } from './src/screens/FacialLoginScreen';
import { CreateOsScreen } from './src/screens/CreateOsScreen';
import { ChamadoItem } from './src/types/sgp';

export type RootStackParamList = {
  Login: undefined;
  FacialLogin: undefined;
  OsList: undefined;
  CreateOs: undefined;
  OsDetail: { chamado: ChamadoItem };
  OsClose: { osId: number; chamado?: ChamadoItem };
  ClientSearch: undefined;
  OfflineClients: undefined;
  AuthorizeOnu: undefined;
  OltConsultation: undefined;
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
  const isCheckingUpdateRef = useRef(false);
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    // Função para verificar se a sessão foi derrubada pelo painel administrativo
    const checkSession = async () => {
      try {
        const isRevoked = await checkIsSessionRevoked();
        if (isRevoked) {
          await logoutLoggedTecnico();
          Alert.alert(
            '⚠️ Sessão Encerrada',
            'Sua sessão foi derrubada pelo administrador no painel web. Faça login novamente.',
            [
              {
                text: 'OK',
                onPress: () => {
                  if (navigationRef.isReady()) {
                    navigationRef.reset({
                      index: 0,
                      routes: [{ name: 'FacialLogin' as never }],
                    });
                  }
                },
              },
            ]
          );
        }
      } catch {}
    };

    // Função para verificar se há atualização no EAS
    const checkForAppUpdates = async () => {
      if (__DEV__ || isCheckingUpdateRef.current) return;
      try {
        isCheckingUpdateRef.current = true;
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          const fetchResult = await Updates.fetchUpdateAsync();
          if (fetchResult.isNew) {
            Alert.alert(
              '🚀 Atualização Disponível!',
              'Uma nova versão do Vega Sync com melhorias foi baixada. Deseja reiniciar o aplicativo agora para aplicar?',
              [
                { text: 'Mais tarde', style: 'cancel' },
                {
                  text: 'Reiniciar Agora',
                  onPress: async () => {
                    try {
                      await Updates.reloadAsync();
                    } catch (e) {
                      console.warn('Erro ao recarregar app:', e);
                    }
                  },
                },
              ]
            );
          }
        }
      } catch (err) {
        console.log('[Updates] Sem conexão ou verificação ignorada:', err);
      } finally {
        isCheckingUpdateRef.current = false;
      }
    };

    // 1. Verifica logo na inicialização
    checkForAppUpdates();
    checkSession();

    // 2. Verifica também sempre que o app volta para primeiro plano
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkForAppUpdates();
        checkSession();
      }
    });

    // 3. Monitora em intervalo de segundo plano a cada 15 segundos
    const timer = setInterval(() => {
      checkSession();
    }, 15000);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={true} />
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName="FacialLogin"
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              contentStyle: { backgroundColor: '#0B0F17' },
            }}
          >
            <Stack.Screen name="FacialLogin">
              {({ navigation }) => (
                <FacialLoginScreen
                  onLoginSuccess={(_, userRole) => {
                    const r = String(userRole || '').toLowerCase();
                    if (r.includes('atend')) {
                      navigation.replace('CreateOs');
                    } else {
                      navigation.replace('OsList');
                    }
                  }}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="Login">
              {({ navigation }) => (
                <LoginScreen onLoginSuccess={() => navigation.replace('OsList')} />
              )}
            </Stack.Screen>

            <Stack.Screen name="CreateOs">
              {({ navigation }) => (
                <CreateOsScreen
                  onBackToOsList={() => navigation.navigate('OsList')}
                  onOpenClientSearch={() => navigation.navigate('ClientSearch')}
                  onOpenOfflineClients={() => navigation.navigate('OfflineClients')}
                  onOpenAuthorizeOnu={() => navigation.navigate('AuthorizeOnu')}
                  onOpenOltConsultation={() => navigation.navigate('OltConsultation')}
                  onLogout={async () => {
                    await logoutLoggedTecnico();
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'FacialLogin' }],
                    });
                  }}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="OsList">
              {({ navigation }) => (
                <OsListScreen
                  onOsClick={(chamado) => navigation.navigate('OsDetail', { chamado })}
                  onOpenCreateOs={() => navigation.navigate('CreateOs')}
                  onOpenClientSearch={() => navigation.navigate('ClientSearch')}
                  onOpenOfflineClients={() => navigation.navigate('OfflineClients')}
                  onOpenAuthorizeOnu={() => navigation.navigate('AuthorizeOnu')}
                  onOpenOltConsultation={() => navigation.navigate('OltConsultation')}
                  onLogout={async () => {
                    await logoutLoggedTecnico();
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'FacialLogin' }],
                    });
                  }}
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

            <Stack.Screen name="OltConsultation">
              {({ navigation }) => (
                <OltConsultationScreen
                  onBackToOs={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="OsDetail">
              {({ navigation, route }) => (
                <OsDetailScreen
                  chamado={route.params.chamado}
                  onBack={() => navigation.goBack()}
                  onCloseOsClick={(osId) => navigation.navigate('OsClose', { osId, chamado: route.params.chamado })}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="OsClose">
              {({ navigation, route }) => (
                <OsCloseScreen
                  osId={route.params.osId}
                  chamado={route.params.chamado}
                  onBack={() => navigation.goBack()}
                  onFinishSuccess={() => navigation.navigate('OsList')}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </View>
      </ErrorBoundary>
    </SafeAreaProvider>
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
