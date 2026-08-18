import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
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
        <View style={styles.iconCircle}>
          <Feather name="shield" size={36} color="#38BDF8" />
        </View>

        <Text style={styles.title}>SGP Técnico</Text>
        <Text style={styles.subtitle}>Sistema de Gestão de Ordens de Serviço</Text>

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
              <Text style={styles.buttonText}>Acessar SGP</Text>
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
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#111726',
    borderWidth: 1,
    borderColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
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
