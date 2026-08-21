import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  verifyNumericCodeSgp,
  getLoggedTecnicoName,
  logoutLoggedTecnico,
} from '../services/webhookService';

interface Props {
  onLoginSuccess: (tecnicoNome: string) => void;
  onSkip?: () => void;
}

export const FacialLoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [numericCode, setNumericCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loggedTecnico, setLoggedTecnico] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    checkExistingLogin();
  }, []);

  const checkExistingLogin = async () => {
    const savedName = await getLoggedTecnicoName();
    if (savedName) {
      setLoggedTecnico(savedName);
    }
  };

  const handleValidateCode = async () => {
    const code = numericCode.trim();
    if (!code) {
      Alert.alert('Atenção', 'Por favor, digite o seu código numérico de técnico.');
      return;
    }

    setIsLoading(true);
    setStatusMsg('Validando código...');

    try {
      const res = await verifyNumericCodeSgp(code);
      setIsLoading(false);

      if (res.sucesso && (res.tecnico || res.nome)) {
        const nomeTecnico = res.tecnico || res.nome || `Técnico (${code})`;
        setLoggedTecnico(nomeTecnico);
        setStatusMsg('✅ Autenticado com Sucesso!');

        Alert.alert(
          'Acesso Liberado!',
          `Código validado com sucesso.\nBem-vindo(a), ${nomeTecnico}!`,
          [
            {
              text: 'Entrar no Sistema',
              onPress: () => onLoginSuccess(nomeTecnico),
            },
          ]
        );
      } else {
        const msg = res.mensagem || 'Código numérico não autorizado.';
        setStatusMsg('❌ ' + msg);
        Alert.alert('Não Autorizado', msg, [{ text: 'Tentar Novamente' }]);
      }
    } catch (e: any) {
      setIsLoading(false);
      setStatusMsg('❌ Erro na validação.');
      Alert.alert('Erro de Conexão', 'Falha ao conectar com o serviço de autenticação.');
    }
  };

  const handleLogout = async () => {
    await logoutLoggedTecnico();
    setLoggedTecnico(null);
    setNumericCode('');
    setStatusMsg(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#070A11" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* HEADER MODERNISMO FUTURISTA */}
          <View style={styles.header}>
            <View style={styles.glowBadge}>
              <Feather name="key" size={28} color="#00F2FE" />
            </View>
            <Text style={styles.title}>AUTENTICAÇÃO DO TÉCNICO</Text>
            <Text style={styles.subtitle}>
              Digite seu código numérico para liberar o acesso ao sistema
            </Text>
          </View>

          {/* TÉCNICO AUTENTICADO */}
          {loggedTecnico ? (
            <View style={styles.successCard}>
              <View style={styles.verifiedIconContainer}>
                <Feather name="check-circle" size={48} color="#10B981" />
              </View>

              <Text style={styles.successBadgeTitle}>SESSÃO AUTENTICADA</Text>
              <Text style={styles.successNameText}>{loggedTecnico}</Text>

              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => onLoginSuccess(loggedTecnico)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryActionBtnText}>Acessar Sistema</Text>
                <Feather name="arrow-right" size={18} color="#070A11" style={{ marginLeft: 8 }} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryTextBtn} onPress={handleLogout} activeOpacity={0.7}>
                <Feather name="rotate-ccw" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                <Text style={styles.secondaryTextBtnText}>Trocar Usuário / Digitar Outro Código</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formContainer}>
              {/* CAMPO DE ENTRADA NUMÉRICA */}
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>DIGITE SEU CÓDIGO NUMÉRICO:</Text>
                <View style={styles.numericInputWrapper}>
                  <Feather name="hash" size={22} color="#00F2FE" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.numericInput}
                    value={numericCode}
                    onChangeText={setNumericCode}
                    placeholder="Ex: 123456"
                    placeholderTextColor="#475569"
                    keyboardType="number-pad"
                    maxLength={10}
                    autoFocus={true}
                    editable={!isLoading}
                  />
                  {numericCode.length > 0 ? (
                    <TouchableOpacity onPress={() => setNumericCode('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Feather name="x-circle" size={18} color="#64748B" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* STATUS DE CARREGAMENTO / RESPOSTA */}
              {isLoading ? (
                <View style={styles.statusLoadingRow}>
                  <ActivityIndicator size="small" color="#00F2FE" />
                  <Text style={styles.statusLoadingText}>Validando código...</Text>
                </View>
              ) : statusMsg ? (
                <Text style={styles.statusInfoText}>{statusMsg}</Text>
              ) : null}

              {/* BOTÃO SUBMIT */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (!numericCode.trim() || isLoading) && { opacity: 0.5 },
                ]}
                onPress={handleValidateCode}
                disabled={!numericCode.trim() || isLoading}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>ENTRAR NO SISTEMA</Text>
                <Feather name="arrow-right" size={18} color="#070A11" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A11',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 28,
  },
  glowBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 242, 254, 0.3)',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // CARD DE AUTENTICADO
  successCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  verifiedIconContainer: {
    marginBottom: 12,
  },
  successBadgeTitle: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  successNameText: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
    marginBottom: 12,
  },
  primaryActionBtnText: {
    color: '#070A11',
    fontSize: 15,
    fontWeight: 'bold',
  },
  secondaryTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryTextBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },

  // FORMULÁRIO DE CÓDIGO NUMÉRICO
  formContainer: {
    width: '100%',
    alignItems: 'center',
  },
  inputCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.2)',
  },
  inputLabel: {
    color: '#00F2FE',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 12,
  },
  numericInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#070A11',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.3)',
  },
  numericInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // STATUS & BOTÃO
  statusLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  statusLoadingText: {
    color: '#00F2FE',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusInfoText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00F2FE',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: '100%',
    marginTop: 20,
  },
  submitBtnText: {
    color: '#070A11',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
