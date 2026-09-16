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
  Dimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  verifyNumericCodeSgp,
  getLoggedTecnicoName,
  getLoggedUserRole,
  logoutLoggedTecnico,
} from '../services/webhookService';

const { width } = Dimensions.get('window');

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
  const [useNativeKeyboard, setUseNativeKeyboard] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    checkExistingLogin();

    // Pulse animation for status badge / logo aura
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Fade in on load
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
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

  const handleKeyPress = (val: string) => {
    if (isLoading) return;
    if (numericCode.length < 8) {
      setNumericCode((prev) => prev + val);
      setStatusMsg(null);
    }
  };

  const handleBackspace = () => {
    if (isLoading) return;
    setNumericCode((prev) => prev.slice(0, -1));
    setStatusMsg(null);
  };

  const handleClear = () => {
    if (isLoading) return;
    setNumericCode('');
    setStatusMsg(null);
  };

  const handleValidateCode = async (codeToValidate?: string) => {
    const code = (codeToValidate || numericCode).trim();
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER COM LOGO VEGA SYNC */}
          <Animated.View
            style={[
              styles.headerSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* AMBIENT GLOW AURA */}
            <Animated.View
              style={[
                styles.logoAura,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />

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
                {/* GLOW DE FUNDO */}
                <View style={styles.cardHeaderGlow} />

                {/* AVATAR COM GLOW E BADGE */}
                <View style={styles.avatarWrapper}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitials}>{getInitials(loggedTecnico)}</Text>
                  </View>
                  <View style={styles.avatarVerifiedBadge}>
                    <Feather name="check" size={14} color="#FFFFFF" />
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
                      style={{ marginRight: 5 }}
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

                {/* DIVISOR SUTIL */}
                <View style={styles.cardDivider} />

                {/* INFO CARDS RÁPIDOS */}
                <View style={styles.quickInfoGrid}>
                  <View style={styles.quickInfoItem}>
                    <Feather name="shield" size={15} color="#818CF8" />
                    <Text style={styles.quickInfoLabel}>Segurança</Text>
                    <Text style={styles.quickInfoValue}>Autenticado</Text>
                  </View>
                  <View style={styles.quickInfoItem}>
                    <Feather name="zap" size={15} color="#38BDF8" />
                    <Text style={styles.quickInfoLabel}>Sincronia</Text>
                    <Text style={styles.quickInfoValue}>Tempo Real</Text>
                  </View>
                  <View style={styles.quickInfoItem}>
                    <Feather name="map-pin" size={15} color="#10B981" />
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
            /* TELA DE AUTENTICAÇÃO (PRE-LOGIN) */
            <Animated.View
              style={[
                styles.preLoginContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.authGlassCard}>
                <View style={styles.authCardHeader}>
                  <Text style={styles.authCardTitle}>ACESSO DO TÉCNICO</Text>
                  <Text style={styles.authCardSubtitle}>
                    Digite seu código numérico de identificação
                  </Text>
                </View>

                {/* DISPLAY DO CÓDIGO (DIGITOS INTERATIVOS) */}
                <TouchableOpacity
                  style={styles.codeDisplayCard}
                  activeOpacity={0.9}
                  onPress={() => {
                    setUseNativeKeyboard(true);
                    setTimeout(() => textInputRef.current?.focus(), 100);
                  }}
                >
                  <View style={styles.codeDigitsRow}>
                    {[0, 1, 2, 3, 4, 5].map((idx) => {
                      const char = numericCode[idx];
                      const isCurrent = numericCode.length === idx;
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.digitBox,
                            char ? styles.digitBoxFilled : null,
                            isCurrent ? styles.digitBoxActive : null,
                          ]}
                        >
                          <Text style={styles.digitBoxText}>
                            {char ? char : isCurrent ? '|' : '•'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* INPUT INVISÍVEL PARA TECLADO NATIVO CASO PREFERIR */}
                  <TextInput
                    ref={textInputRef}
                    style={styles.hiddenInput}
                    value={numericCode}
                    onChangeText={setNumericCode}
                    keyboardType="number-pad"
                    maxLength={8}
                    editable={!isLoading}
                  />

                  {numericCode.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearMiniBtn}
                      onPress={handleClear}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Feather name="x-circle" size={16} color="#64748B" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

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

                {/* TECLADO NUMÉRICO MODERNO EMBUTIDO */}
                <View style={styles.keypadContainer}>
                  {[
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['C', '0', '⌫'],
                  ].map((row, rIdx) => (
                    <View key={rIdx} style={styles.keypadRow}>
                      {row.map((btn) => {
                        const isAction = btn === 'C' || btn === '⌫';
                        return (
                          <TouchableOpacity
                            key={btn}
                            style={[
                              styles.keypadBtn,
                              isAction ? styles.keypadActionBtn : null,
                            ]}
                            onPress={() => {
                              if (btn === 'C') handleClear();
                              else if (btn === '⌫') handleBackspace();
                              else handleKeyPress(btn);
                            }}
                            activeOpacity={0.7}
                            disabled={isLoading}
                          >
                            {btn === '⌫' ? (
                              <Feather name="delete" size={20} color="#94A3B8" />
                            ) : (
                              <Text
                                style={[
                                  styles.keypadBtnText,
                                  isAction ? styles.keypadActionBtnText : null,
                                ]}
                              >
                                {btn}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>

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
                  <Feather name="arrow-right" size={18} color="#070A11" style={{ marginLeft: 8 }} />
                </TouchableOpacity>

                {/* FOOTER DE SEGURANÇA */}
                <View style={styles.securityFooter}>
                  <Feather name="lock" size={12} color="#475569" style={{ marginRight: 6 }} />
                  <Text style={styles.securityFooterText}>
                    Acesso Criptografado de Ponta a Ponta • Vega Sync v2.0
                  </Text>
                </View>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },

  // HEADER & LOGO
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    width: '100%',
  },
  logoAura: {
    position: 'absolute',
    top: -10,
    width: 140,
    height: 70,
    borderRadius: 70,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    filter: 'blur(20px)',
  },
  logoImage: {
    width: 220,
    height: 64,
    marginBottom: 10,
  },
  systemStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  statusLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 7,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 3,
  },
  systemStatusText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // PRE-LOGIN AUTH GLASS CARD
  preLoginContainer: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  authGlassCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  authCardHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  authCardTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  authCardSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  // DIGIT DISPLAY
  codeDisplayCard: {
    backgroundColor: '#070A11',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    marginBottom: 14,
    position: 'relative',
    justifyContent: 'center',
  },
  codeDigitsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  digitBox: {
    width: 38,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(100, 116, 139, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitBoxFilled: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  digitBoxActive: {
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  digitBoxText: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  clearMiniBtn: {
    position: 'absolute',
    right: 12,
    top: 14,
    padding: 4,
  },

  // STATUS BANNER
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
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

  // KEYPAD
  keypadContainer: {
    width: '100%',
    marginBottom: 14,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  keypadBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#070A11',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  keypadActionBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  keypadBtnText: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
  },
  keypadActionBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },

  // SUBMIT BUTTON
  authSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 15,
    borderRadius: 14,
    width: '100%',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  authSubmitBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
  },
  authSubmitBtnText: {
    color: '#070A11',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  securityFooterText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '500',
  },

  // POST-LOGIN / SESSSÃO ATIVA
  postLoginContainer: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  technicianCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  cardHeaderGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#070A11',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarInitials: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  avatarVerifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#10B981',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  greetingText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  technicianName: {
    color: '#F8FAFC',
    fontSize: 22,
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
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
    marginBottom: 14,
  },
  primaryLaunchBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLaunchBtnText: {
    color: '#070A11',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
    marginRight: 10,
  },
  primaryLaunchIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
