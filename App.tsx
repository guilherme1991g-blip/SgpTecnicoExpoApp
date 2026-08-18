import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { OsListScreen } from './src/screens/OsListScreen';
import { OsDetailScreen } from './src/screens/OsDetailScreen';
import { OsCloseScreen } from './src/screens/OsCloseScreen';
import { ChamadoItem } from './src/types/sgp';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'Login' | 'OsList' | 'OsDetail' | 'OsClose'>('OsList');
  const [selectedChamado, setSelectedChamado] = useState<ChamadoItem | null>(null);
  const [selectedOsId, setSelectedOsId] = useState<number>(0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
});
