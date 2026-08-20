import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Alert,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import {
  verifyFacialRecognitionSgp,
  getLoggedTecnicoName,
  logoutLoggedTecnico,
} from '../services/webhookService';

interface Props {
  onLoginSuccess: (tecnicoNome: string) => void;
  onSkip?: () => void;
}

export const FacialLoginScreen: React.FC<Props> = ({ onLoginSuccess, onSkip }) => {
  const [capturedPhoto, setCapturedPhoto] = useState<{ uri: string; base64: string } | null>(null);
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

  // CAPTURA SELFIE APENAS COM A CÂMERA FRONTAL (GALERIA PROIBIDA)
  const handleTakeSelfieFrontCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permissão da Câmera',
          'Permissão para usar a câmera é necessária para o reconhecimento facial.'
        );
        return;
      }

      setStatusMsg(null);

      // Abre obrigatoriamente a Câmera Frontal (cameraType: ImagePicker.CameraType.front)
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setCapturedPhoto({
            uri: asset.uri,
            base64: asset.base64,
          });
          // Processa a validação enviando o base64 para o webhook de reconhecimento facial
          processFacialRecognition(asset.base64);
        } else {
          Alert.alert('Erro', 'Não foi possível obter a imagem da selfie em base64.');
        }
      }
    } catch (err) {
      console.warn('Erro ao abrir câmera frontal:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao abrir a câmera frontal.');
    }
  };

  // PROCESSA A ENVIADA DO BASE64 PARA O WEBHOOK N8N
  const processFacialRecognition = async (base64Img: string) => {
    setIsLoading(true);
    setStatusMsg('Enviando selfie para validação facial no n8n...');

    try {
      const res = await verifyFacialRecognitionSgp(base64Img);
      setIsLoading(false);

      if (res.sucesso && (res.tecnico || res.nome)) {
        const nomeTecnico = res.tecnico || res.nome || 'Técnico de Campo';
        setLoggedTecnico(nomeTecnico);
        setStatusMsg(`✅ Reconhecimento facial aprovado!`);

        Alert.alert(
          'Acesso Liberado!',
          `Reconhecimento facial confirmado.\nBem-vindo, ${nomeTecnico}!`,
          [
            {
              text: 'Acessar Ordens de Serviço',
              onPress: () => onLoginSuccess(nomeTecnico),
            },
          ]
        );
      } else {
        setStatusMsg('❌ ' + (res.mensagem || 'Reconhecimento facial não reconhecido.'));
        Alert.alert(
          'Não Autorizado',
          res.mensagem || 'O rosto capturado não corresponde a um técnico autorizado.',
          [{ text: 'Tentar Novamente', onPress: () => setCapturedPhoto(null) }]
        );
      }
    } catch (e) {
      setIsLoading(false);
      setStatusMsg('❌ Erro na validação.');
      Alert.alert('Erro', 'Falha ao conectar com o serviço de reconhecimento facial.');
    }
  };

  const handleLogout = async () => {
    await logoutLoggedTecnico();
    setLoggedTecnico(null);
    setCapturedPhoto(null);
    setStatusMsg(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CABEÇALHO */}
        <View style={styles.header}>
          <View style={styles.badgeIconHeader}>
            <Feather name="user-check" size={28} color="#38BDF8" />
          </View>
          <Text style={styles.title}>Reconhecimento Facial</Text>
          <Text style={styles.subtitle}>
            Para liberar o acesso, capture uma selfie ao vivo utilizando apenas a câmera frontal do aparelho.
          </Text>
        </View>

        {/* CARTÃO DE TÉCNICO LOGADO */}
        {loggedTecnico ? (
          <View style={styles.verifiedCard}>
            <View style={styles.verifiedHeaderRow}>
              <View style={styles.verifiedDot} />
              <Text style={styles.verifiedStatusText}>SESSÃO ATIVA</Text>
            </View>

            <Text style={styles.loggedLabel}>Técnico Identificado:</Text>
            <Text style={styles.loggedName}>{loggedTecnico}</Text>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => onLoginSuccess(loggedTecnico)}
              activeOpacity={0.8}
            >
              <Feather name="arrow-right" size={16} color="#0D1117" style={{ marginRight: 6 }} />
              <Text style={styles.continueBtnText}>Entrar no App como {loggedTecnico}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <Feather name="refresh-cw" size={14} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.logoutBtnText}>Trocar Técnico / Refazer Selfie</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraBoxContainer}>
            {/* CONTAINER DA CÂMERA OU SELFIE CAPTURADA */}
            <View style={styles.avatarFrame}>
              {capturedPhoto ? (
                <Image source={{ uri: capturedPhoto.uri }} style={styles.capturedImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Feather name="camera" size={54} color="#38BDF8" />
                  <Text style={styles.avatarPlaceholderText}>Câmera Frontal</Text>
                </View>
              )}
            </View>

            {/* SPINNER DE LOADING */}
            {isLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={styles.loadingText}>Analisando Reconhecimento Facial no n8n...</Text>
              </View>
            ) : null}

            {/* MENSAGEM DE STATUS */}
            {statusMsg && !isLoading ? (
              <Text style={styles.statusText}>{statusMsg}</Text>
            ) : null}

            {/* BOTÃO PRINCIPAL: APENAS CÂMERA FRONTAL */}
            <TouchableOpacity
              style={styles.takeSelfieBtn}
              onPress={handleTakeSelfieFrontCamera}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Feather name="camera" size={18} color="#0D1117" style={{ marginRight: 8 }} />
              <Text style={styles.takeSelfieBtnText}>
                {capturedPhoto ? 'Tirar Outra Selfie (Câmera Frontal)' : 'Tirar Selfie com Câmera Frontal'}
              </Text>
            </TouchableOpacity>

            <View style={styles.ruleNoticeBox}>
              <Feather name="alert-circle" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
              <Text style={styles.ruleNoticeText}>
                Importante: Envio via galeria desativado. Apenas foto capturada ao vivo na câmera frontal é aceita.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  badgeIconHeader: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  cameraBoxContainer: {
    width: '100%',
    backgroundColor: '#161F30',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  avatarFrame: {
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#38BDF8',
    backgroundColor: '#0B0F17',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
  },
  capturedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  loadingBox: {
    alignItems: 'center',
    marginVertical: 12,
  },
  loadingText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statusText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 10,
  },
  takeSelfieBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    marginTop: 10,
  },
  takeSelfieBtnText: {
    color: '#0D1117',
    fontSize: 14,
    fontWeight: 'bold',
  },
  ruleNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  ruleNoticeText: {
    color: '#F59E0B',
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  verifiedCard: {
    width: '100%',
    backgroundColor: '#161F30',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  verifiedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 14,
  },
  verifiedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  verifiedStatusText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: 'bold',
  },
  loggedLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  loggedName: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 10,
  },
  continueBtnText: {
    color: '#0D1117',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '100%',
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
