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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  verifyNumericCodeSgp,
  getLoggedTecnicoName,
  setLoggedTecnicoName,
  getLoggedUserRole,
  setLoggedUserRole,
  logoutLoggedTecnico,
} from '../services/webhookService';
import {
  authenticateWithSupabase,
  getSavedCompanyCode,
  setSavedCompanyCode,
} from '../services/multiTenantService';

interface Props {
  onLoginSuccess: (tecnicoNome: string, userRole?: string) => void;
  onSkip?: () => void;
}

export const FacialLoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [companyCode, setCompanyCode] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loggedTecnico, setLoggedTecnico] = useState<string | null>(null);
  const [loggedRole, setLoggedRole] = useState<string>('tecnico');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isCompanyFocused, setIsCompanyFocused] = useState(false);
  const [isEmployeeFocused, setIsEmployeeFocused] = useState(false);

  // Smooth appearance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;
  const employeeInputRef = useRef<TextInput>(null);

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
    const keep = await AsyncStorage.getItem('@keep_logged_in');
    const savedCompany = await getSavedCompanyCode();

    if (savedCompany) {
      setCompanyCode(savedCompany);
    }

    if (keep === 'false') {
      return;
    }

    const savedName = await getLoggedTecnicoName();
    const savedRole = await getLoggedUserRole();

    if (savedName) {
      setLoggedTecnico(savedName);
      setLoggedRole(savedRole || 'tecnico');
      // Direto para o sistema se "Manter conectado" estiver ativo
      onLoginSuccess(savedName, savedRole || 'tecnico');
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
    const company = companyCode.trim().toUpperCase();
    const pass = employeeCode.trim();

    if (!company) {
      setStatusMsg({ text: 'Por favor, informe o código da empresa.', type: 'error' });
      return;
    }

    if (!pass) {
      setStatusMsg({ text: 'Por favor, digite o código do colaborador.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatusMsg({ text: 'Carregando...', type: 'info' });

    try {
      // 1. Tenta autenticação via Supabase Multi-Tenant (Empresa + Funcionário)
      const resSupabase = await authenticateWithSupabase(company, pass);

      if (resSupabase.sucesso && resSupabase.session) {
        setIsLoading(false);
        const nomeTecnico = resSupabase.session.tecnicoNome || `Usuário (${pass})`;
        const userRole = resSupabase.session.tecnicoRole || 'tecnico';
        
        await setSavedCompanyCode(company);
        await setLoggedTecnicoName(nomeTecnico);
        await setLoggedUserRole(userRole);
        await AsyncStorage.setItem('@keep_logged_in', keepLoggedIn ? 'true' : 'false');

        setLoggedTecnico(nomeTecnico);
        setLoggedRole(userRole);
        setStatusMsg({ text: 'Autenticação autorizada!', type: 'success' });

        // VAI DIRETO PARA O SISTEMA SEM DIÁLOGO OU TELA INTERMEDIÁRIA
        onLoginSuccess(nomeTecnico, userRole);
        return;
      }

      // 2. Se não encontrou no Supabase, tenta fallback via Webhook SGP
      const resWebhook = await verifyNumericCodeSgp(pass);
      setIsLoading(false);

      if (resWebhook.sucesso && (resWebhook.tecnico || resWebhook.nome)) {
        const nomeTecnico = resWebhook.tecnico || resWebhook.nome || `Usuário (${pass})`;
        const userRole = resWebhook.role || 'tecnico';
        
        await setSavedCompanyCode(company);
        await setLoggedTecnicoName(nomeTecnico);
        await setLoggedUserRole(userRole);
        await AsyncStorage.setItem('@keep_logged_in', keepLoggedIn ? 'true' : 'false');

        setLoggedTecnico(nomeTecnico);
        setLoggedRole(userRole);
        setStatusMsg({ text: 'Autenticação autorizada!', type: 'success' });

        // VAI DIRETO PARA O SISTEMA SEM DIÁLOGO OU TELA INTERMEDIÁRIA
        onLoginSuccess(nomeTecnico, userRole);
      } else {
        const msg = resSupabase.mensagem || resWebhook.mensagem || 'Empresa ou código de colaborador incorreto.';
        setStatusMsg({ text: msg, type: 'error' });
      }
    } catch (e: any) {
      setIsLoading(false);
      setStatusMsg({ text: 'Falha de conexão com o servidor.', type: 'error' });
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
            setEmployeeCode('');
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
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* TOPO: LOGO VEGA SYNC & STATUS */}
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

          </Animated.View>

          {/* MEIO: FORMULÁRIO DE LOGIN */}
          <View style={styles.centerSection}>
            <Animated.View
              style={[
                styles.preLoginContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
                {/* 1. CAMPO CÓDIGO DA EMPRESA */}
                <View style={styles.inputLabelContainer}>
                  <Text style={styles.inputLabelText}>Código da Empresa</Text>
                </View>
                <View
                  style={[
                    styles.inputWrapper,
                    isCompanyFocused && styles.inputWrapperFocused,
                  ]}
                >
                  <Feather name="briefcase" size={18} color={isCompanyFocused ? "#38BDF8" : "#64748B"} style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.numericTextInput}
                    value={companyCode}
                    onChangeText={(text) => {
                      setCompanyCode(text.toUpperCase());
                      setStatusMsg(null);
                    }}
                    placeholder=""
                    placeholderTextColor="#475569"
                    autoCapitalize="characters"
                    editable={!isLoading}
                    onFocus={() => setIsCompanyFocused(true)}
                    onBlur={() => setIsCompanyFocused(false)}
                    returnKeyType="next"
                    onSubmitEditing={() => employeeInputRef.current?.focus()}
                  />
                  {companyCode.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setCompanyCode('');
                        setStatusMsg(null);
                      }}
                      style={styles.clearBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Feather name="x" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* 2. CAMPO CÓDIGO DO COLABORADOR */}
                <View style={[styles.inputLabelContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabelText}>Código do Colaborador</Text>
                </View>
                <View
                  style={[
                    styles.inputWrapper,
                    isEmployeeFocused && styles.inputWrapperFocused,
                  ]}
                >
                  <Feather name="lock" size={18} color={isEmployeeFocused ? "#38BDF8" : "#64748B"} style={{ marginRight: 10 }} />
                  <TextInput
                    ref={employeeInputRef}
                    style={styles.numericTextInput}
                    value={employeeCode}
                    onChangeText={(text) => {
                      setEmployeeCode(text);
                      setStatusMsg(null);
                    }}
                    placeholder=""
                    placeholderTextColor="#475569"
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                    onFocus={() => setIsEmployeeFocused(true)}
                    onBlur={() => setIsEmployeeFocused(false)}
                    returnKeyType="done"
                    onSubmitEditing={() => handleValidateCode()}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.clearBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={isEmployeeFocused ? "#38BDF8" : "#94A3B8"} />
                  </TouchableOpacity>
                </View>

                {/* CAIXINHA MANTER CONECTADO */}
                <TouchableOpacity
                  style={styles.keepLoggedInRow}
                  onPress={() => setKeepLoggedIn(!keepLoggedIn)}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={keepLoggedIn ? "check-square" : "square"}
                    size={18}
                    color={keepLoggedIn ? "#38BDF8" : "#64748B"}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.keepLoggedInText}>Manter conectado</Text>
                </TouchableOpacity>

                {/* FEEDBACK / STATUS MSG */}
                {isLoading ? (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color="#38BDF8" />
                    <Text style={styles.statusLoadingText}>Carregando...</Text>
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
                    (!companyCode.trim() || !employeeCode.trim() || isLoading) && styles.authSubmitBtnDisabled,
                  ]}
                  onPress={() => handleValidateCode()}
                  disabled={!companyCode.trim() || !employeeCode.trim() || isLoading}
                  activeOpacity={0.88}
                >
                  <Text style={styles.authSubmitBtnText}>Entrar</Text>
                  <View style={styles.submitArrowCircle}>
                    <Feather name="arrow-right" size={16} color="#070A11" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
          </View>

          {/* BAIXO: CONEXÃO SEGURA */}
          <Animated.View style={[styles.bottomSection, { opacity: fadeAnim }]}>
            <View style={styles.securityFooter}>
              <Feather name="lock" size={13} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.securityFooterText}>
                Conexão Segura
              </Text>
            </View>
          </Animated.View>
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
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 16 : 24,
    paddingBottom: Platform.OS === 'ios' ? 20 : 28,
  },

  // TOPO: HEADER & LOGO
  headerSection: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 8,
  },
  logoImage: {
    width: 250,
    height: 75,
    marginBottom: 10,
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

  // MEIO: CENTRO DA TELA
  centerSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginVertical: 24,
  },

  // PRE-LOGIN (CAMPO + BOTÃO)
  preLoginContainer: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  inputLabelContainer: {
    width: '100%',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  inputLabelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
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

  // MANTER CONECTADO CHECKBOX
  keepLoggedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  keepLoggedInText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
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

  // BAIXO: FOOTER DE SEGURANÇA
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 8,
  },
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityFooterText: {
    color: '#64748B',
    fontSize: 12,
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
