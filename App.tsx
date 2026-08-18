import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { OsListScreen } from './src/screens/OsListScreen';
import { OsDetailScreen } from './src/screens/OsDetailScreen';
import { OsCloseScreen } from './src/screens/OsCloseScreen';
import { ChamadoItem } from './src/types/sgp';

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
  const [currentScreen, setCurrentScreen] = useState<'Login' | 'OsList' | 'OsDetail' | 'OsClose'>('OsList');
  const [selectedChamado, setSelectedChamado] = useState<ChamadoItem | null>(null);
  const [selectedOsId, setSelectedOsId] = useState<number>(0);

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={true} />
        {currentScreen === 'Login' && (
          <LoginScreen onLoginSuccess={() => setCurrentScreen('OsList')} />
        )}
        {currentScreen === 'OsList' && (
          <OsListScreen
            onOsClick={(chamado) => {
              setSelectedChamado(chamado);
              setCurrentScreen('OsDetail');
            }}
            onLogout={() => setCurrentScreen('Login')}
          />
        )}
        {currentScreen === 'OsDetail' && selectedChamado && (
          <OsDetailScreen
            chamado={selectedChamado}
            onBack={() => setCurrentScreen('OsList')}
            onCloseOsClick={(osId) => {
              setSelectedOsId(osId);
              setCurrentScreen('OsClose');
            }}
          />
        )}
        {currentScreen === 'OsClose' && (
          <OsCloseScreen
            osId={selectedOsId}
            onBack={() => setCurrentScreen('OsDetail')}
            onFinishSuccess={() => setCurrentScreen('OsList')}
          />
        )}
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
