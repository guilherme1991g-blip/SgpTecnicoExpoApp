import React, { useState, useEffect, useRef } from 'react';
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
  Image,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  verifyNumericCodeSgp,
  getLoggedTecnicoName,
  getLoggedUserRole,
  logoutLoggedTecnico,
} from '../services/webhookService';

interface Props {
  onLoginSuccess: (tecnicoNome: string, userRole?: string) => void;
  onSkip?: () => void;
}

export const FacialLoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [numericCode, setNumericCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loggedTecnico, setLoggedTecnico] = useState<string | null>(null);
  const [loggedRole, setLoggedRole] = useState<string>('tecnico');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Smooth appearance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    checkExistingLogin();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const checkExistingLogin = async () => {
    const savedName = await getLoggedTecnicoName();
    const savedRole = await getLoggedUserRole();
    if (savedName) {
      setLoggedTecnico(savedName);
      setLoggedRole(savedRole || 'tecnico');
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getInitials = (name: string) => {
    if (!name) return 'VS';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleValidateCode = async () => {
    const code = numericCode.trim();
    if (!code) {
      Alert.alert('Código Obrigatório', 'Por favor, digite seu código numérico de acesso.');
      return;
    }

    setIsLoading(true);
    setStatusMsg({ text: 'Validando credenciais no SGP...', type: 'info' });

    try {
      const res = await verifyNumericCodeSgp(code);
      setIsLoading(false);

      if (res.sucesso && (res.tecnico || res.nome)) {
        const nomeTecnico = res.tecnico || res.nome || `Usuário (${code})`;
        const userRole = res.role || 'tecnico';
        setLoggedTecnico(nomeTecnico);
        setLoggedRole(userRole);
        setStatusMsg({ text: 'Autenticação autorizada com sucesso!', type: 'success' });

        Alert.alert(
          'Acesso Liberado!',
          `Código validado com sucesso.\nBem-vindo(a), ${nomeTecnico}!`,
          [
            {
              text: 'Entrar no Sistema',
              onPress: () => onLoginSuccess(nomeTecnico, userRole),
            },
          ]
        );
      } else {
        const msg = res.mensagem || 'Código numérico não autorizado.';
        setStatusMsg({ text: msg, type: 'error' });
        Alert.alert('Não Autorizado', msg, [{ text: 'Tentar Novamente' }]);
      }
    } catch (e: any) {
      setIsLoading(false);
      setStatusMsg({ text: 'Falha de conexão com o servidor.', type: 'error' });
      Alert.alert('Erro de Conexão', 'Falha ao conectar com o serviço de autenticação SGP.');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Encerrar Sessão',
      'Deseja realmente desconectar e entrar com outro código?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            await logoutLoggedTecnico();
            setLoggedTecnico(null);
            setLoggedRole('tecnico');
            setNumericCode('');
            setStatusMsg(null);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#070A11" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER COM LOGO VEGA SYNC LIMPA */}
          <Animated.View
            style={[
              styles.headerSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Image
              source={require('../../assets/logo-white.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />

            {/* STATUS RIBBON */}
            <View style={styles.systemStatusPill}>
              <View style={styles.statusLiveDot} />
              <Text style={styles.systemStatusText}>SGP INTEGRATION ONLINE</Text>
            </View>
          </Animated.View>

          {/* SESSÃO ATIVA (POST-LOGIN) */}
          {loggedTecnico ? (
            <Animated.View
              style={[
                styles.postLoginContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              {/* CARD PRINCIPAL DO TÉCNICO AUTENTICADO */}
              <View style={styles.technicianCard}>
                {/* AVATAR COM BADGE */}
                <View style={styles.avatarWrapper}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitials}>{getInitials(loggedTecnico)}</Text>
                  </View>
                  <View style={styles.avatarVerifiedBadge}>
                    <Feather name="check" size={13} color="#FFFFFF" />
                  </View>
                </View>

                {/* SAUDAÇÃO & NOME */}
                <Text style={styles.greetingText}>{getGreeting()},</Text>
                <Text style={styles.technicianName} numberOfLines={2}>
                  {loggedTecnico}
                </Text>

                {/* CARGO & STATUS */}
                <View style={styles.roleBadgeContainer}>
                  <View style={styles.rolePill}>
                    <Feather
                      name={loggedRole.includes('atend') ? 'headphones' : 'tool'}
                      size={13}
                      color="#38BDF8"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.rolePillText}>
                      {loggedRole.includes('atend') ? 'Atendimento / Suporte' : 'Técnico de Campo'}
                    </Text>
                  </View>

                  <View style={styles.connectedPill}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedPillText}>Sessão Ativa</Text>
                  </View>
                </View>

                {/* DIVISOR */}
                <View style={styles.cardDivider} />

                {/* INFO CARDS RÁPIDOS */}
                <View style={styles.quickInfoGrid}>
                  <View style={styles.quickInfoItem}>
                    <Feather name="shield" size={16} color="#818CF8" />
                    <Text style={styles.quickInfoLabel}>Segurança</Text>
                    <Text style={styles.quickInfoValue}>Autenticado</Text>
                  </View>
                  <View style={styles.quickInfoItem}>
                    <Feather name="zap" size={16} color="#38BDF8" />
                    <Text style={styles.quickInfoLabel}>Sincronia</Text>
                    <Text style={styles.quickInfoValue}>Tempo Real</Text>
                  </View>
                  <View style={styles.quickInfoItem}>
                    <Feather name="map-pin" size={16} color="#10B981" />
                    <Text style={styles.quickInfoLabel}>GPS Live</Text>
                    <Text style={styles.quickInfoValue}>Habilitado</Text>
                  </View>
                </View>

                {/* BOTÃO PRINCIPAL DE ACESSO */}
                <TouchableOpacity
                  style={styles.primaryLaunchBtn}
                  onPress={() => onLoginSuccess(loggedTecnico, loggedRole)}
                  activeOpacity={0.88}
                >
                  <View style={styles.primaryLaunchBtnContent}>
                    <Text style={styles.primaryLaunchBtnText}>ACESSAR SISTEMA</Text>
                    <View style={styles.primaryLaunchIconCircle}>
                      <Feather name="arrow-right" size={18} color="#070A11" />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* BOTÃO DE TROCA DE USUÁRIO */}
                <TouchableOpacity
                  style={styles.switchUserBtn}
                  onPress={handleLogout}
                  activeOpacity={0.7}
                >
                  <Feather name="log-out" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text style={styles.switchUserBtnText}>Trocar Usuário / Digitar Outro Código</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            /* TELA DE AUTENTICAÇÃO (PRE-LOGIN - CLEAN: CAMPO, BOTÃO E CONEXÃO SEGURA) */
            <Animated.View
              style={[
                styles.preLoginContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              {/* CAMPO DE ENTRADA NUMÉRICA */}
              <View
                style={[
                  styles.inputWrapper,
                  isFocused && styles.inputWrapperFocused,
                ]}
              >
                <TextInput
                  ref={inputRef}
                  style={styles.numericTextInput}
                  value={numericCode}
                  onChangeText={(text) => {
                    setNumericCode(text);
                    setStatusMsg(null);
                  }}
                  placeholder="Digite seu código de acesso..."
                  placeholderTextColor="#475569"
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus={true}
                  editable={!isLoading}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={() => handleValidateCode()}
                />

                {numericCode.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setNumericCode('');
                      setStatusMsg(null);
                    }}
                    style={styles.clearBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="x" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* FEEDBACK / STATUS MSG */}
              {isLoading ? (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color="#38BDF8" />
                  <Text style={styles.statusLoadingText}>Autenticando no SGP...</Text>
                </View>
              ) : statusMsg ? (
                <View
                  style={[
                    styles.statusBanner,
                    statusMsg.type === 'error'
                      ? styles.statusBannerError
                      : statusMsg.type === 'success'
                      ? styles.statusBannerSuccess
                      : styles.statusBannerInfo,
                  ]}
                >
                  <Feather
                    name={
                      statusMsg.type === 'error'
                        ? 'alert-circle'
                        : statusMsg.type === 'success'
                        ? 'check-circle'
                        : 'info'
                    }
                    size={15}
                    color={
                      statusMsg.type === 'error'
                        ? '#EF4444'
                        : statusMsg.type === 'success'
                        ? '#10B981'
                        : '#38BDF8'
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.statusBannerText,
                      statusMsg.type === 'error'
                        ? { color: '#FCA5A5' }
                        : statusMsg.type === 'success'
                        ? { color: '#86EFAC' }
                        : { color: '#BAE6FD' },
                    ]}
                  >
                    {statusMsg.text}
                  </Text>
                </View>
              ) : null}

              {/* BOTÃO SUBMIT */}
              <TouchableOpacity
                style={[
                  styles.authSubmitBtn,
                  (!numericCode.trim() || isLoading) && styles.authSubmitBtnDisabled,
                ]}
                onPress={() => handleValidateCode()}
                disabled={!numericCode.trim() || isLoading}
                activeOpacity={0.88}
              >
                <Text style={styles.authSubmitBtnText}>ENTRAR NO SISTEMA</Text>
                <View style={styles.submitArrowCircle}>
                  <Feather name="arrow-right" size={16} color="#070A11" />
                </View>
              </TouchableOpacity>

              {/* FOOTER DE SEGURANÇA */}
              <View style={styles.securityFooter}>
                <Feather name="lock" size={12} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.securityFooterText}>
                  Conexão Segura • SGP Integrado em Tempo Real
                </Text>
              </View>
            </Animated.View>
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
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },

  // HEADER & LOGO
  headerSection: {
    alignItems: 'center',
    marginBottom: 36,
    width: '100%',
  },
  logoImage: {
    width: 250,
    height: 75,
    marginBottom: 12,
  },
  systemStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  statusLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 7,
  },
  systemStatusText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // PRE-LOGIN (SEM CARD: INPUT DIRETO + BOTÃO + CONEXÃO SEGURA)
  preLoginContainer: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  inputWrapperFocused: {
    borderColor: '#38BDF8',
    backgroundColor: '#0B132B',
  },
  numericTextInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingVertical: 0,
  },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },

  // STATUS BANNER
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  statusLoadingText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
  },
  statusBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusBannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusBannerInfo: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // SUBMIT BUTTON
  authSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    width: '100%',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 24,
  },
  authSubmitBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
  },
  authSubmitBtnText: {
    color: '#070A11',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginRight: 8,
  },
  submitArrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(7, 10, 17, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityFooterText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },

  // POST-LOGIN / SESSÃO ATIVA
  postLoginContainer: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
  },
  technicianCard: {
    width: '100%',
    backgroundColor: '#0D1424',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#070A11',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  avatarInitials: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  avatarVerifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#10B981',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0D1424',
  },
  greetingText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  technicianName: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  roleBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  rolePillText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  connectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  connectedPillText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 18,
  },
  quickInfoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 22,
    gap: 8,
  },
  quickInfoItem: {
    flex: 1,
    backgroundColor: '#070A11',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  quickInfoLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  quickInfoValue: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  primaryLaunchBtn: {
    width: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 14,
  },
  primaryLaunchBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLaunchBtnText: {
    color: '#070A11',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    marginRight: 10,
  },
  primaryLaunchIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(7, 10, 17, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  switchUserBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
});
