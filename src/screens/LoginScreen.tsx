import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { fetchTiposOcorrencia } from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await fetchTiposOcorrencia();
      setIsLoading(false);
      onLoginSuccess();
    } catch (error) {
      setIsLoading(false);
      onLoginSuccess();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/logo-white.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        <Text style={styles.subtitle}>Gestão de Campo e Ordens de Serviço</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <>
              <Feather name="log-in" size={18} color="#0F172A" style={styles.btnIcon} />
              <Text style={styles.buttonText}>Acessar Vega Sync</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 240,
    height: 80,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 36,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    borderRadius: 12,
    height: 50,
    width: '100%',
    maxWidth: 320,
  },
  btnIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
});
