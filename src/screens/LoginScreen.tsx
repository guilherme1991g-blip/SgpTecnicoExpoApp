import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { fetchTiposOcorrencia } from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

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
      <StatusBar barStyle="light-content" backgroundColor="#070A11" />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Image
          source={require('../../assets/logo-white.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        {/* STATUS PILL */}
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusPillText}>SGP CLOUD PLATFORM</Text>
        </View>

        <Text style={styles.subtitle}>Gestão de Campo e Ordens de Serviço</Text>

        <View style={styles.cardContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.88}
          >
            {isLoading ? (
              <ActivityIndicator color="#070A11" />
            ) : (
              <>
                <Feather name="log-in" size={18} color="#070A11" style={styles.btnIcon} />
                <Text style={styles.buttonText}>Acessar Vega Sync</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={12} color="#475569" style={{ marginRight: 6 }} />
          <Text style={styles.footerText}>Vega Sync Enterprise • Conexão Segura</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A11',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 250,
    height: 75,
    marginBottom: 16,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    marginBottom: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusPillText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 36,
    textAlign: 'center',
    fontWeight: '500',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 340,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    borderRadius: 16,
    height: 54,
    width: '100%',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  btnIcon: {
    marginRight: 10,
  },
  buttonText: {
    color: '#070A11',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 30,
  },
  footerText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
});
