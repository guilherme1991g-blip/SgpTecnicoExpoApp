import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { updateChamadoStatus, addAnexoBase64 } from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  osId: number;
  onBack: () => void;
  onFinishSuccess: () => void;
}

interface PhotoAttachment {
  id: string;
  uri: string;
  base64?: string;
  filename: string;
  description: string;
}

export const OsCloseScreen: React.FC<Props> = ({ osId, onBack, onFinishSuccess }) => {
  const [servicoPrestado, setServicoPrestado] = useState('');
  const [observacao, setObservacao] = useState('');
  const [photos, setPhotos] = useState<PhotoAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // TIRAR FOTO COM A CÂMERA DO DISPOSITIVO
  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão Negada', 'Permissão para usar a câmera é necessária para tirar fotos do serviço.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newPhoto: PhotoAttachment = {
          id: Date.now().toString(),
          uri: asset.uri,
          base64: asset.base64 || '',
          filename: `foto_os_${osId}_${photos.length + 1}.jpg`,
          description: `Foto do serviço prestado O.S. #${osId}`,
        };
        setPhotos((prev) => [...prev, newPhoto]);
      }
    } catch (err) {
      console.warn('Erro ao tirar foto:', err);
      Alert.alert('Erro', 'Não foi possível capturar a foto.');
    }
  };

  // SELECIONAR FOTO DA GALERIA
  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão Negada', 'Permissão para acessar a galeria é necessária.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newPhoto: PhotoAttachment = {
          id: Date.now().toString(),
          uri: asset.uri,
          base64: asset.base64 || '',
          filename: `galeria_os_${osId}_${photos.length + 1}.jpg`,
          description: `Foto em anexo O.S. #${osId}`,
        };
        setPhotos((prev) => [...prev, newPhoto]);
      }
    } catch (err) {
      console.warn('Erro ao escolher da galeria:', err);
      Alert.alert('Erro', 'Não foi possível selecionar a foto da galeria.');
    }
  };

  // REMOVER FOTO ANEXADA
  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  // FINALIZAR O.S. E ENVIAR FOTOS PARA O SGP
  const handleFinalize = async () => {
    if (!servicoPrestado.trim()) {
      setErrorMsg('Informe o serviço prestado para finalizar a O.S.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Atualiza status da O.S. para Encerrada (os_status: 1)
      await updateChamadoStatus(
        osId,
        1,
        servicoPrestado,
        observacao
      );

      // 2. Envia todas as fotos anexadas para o SGP (/api/central/chamado/{osId}/anexo/add/)
      let uploadedCount = 0;
      if (photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          if (p.base64) {
            try {
              await addAnexoBase64(
                osId,
                p.base64,
                p.filename,
                p.description || `Foto da Instalação/Serviço #${i + 1}`
              );
              uploadedCount++;
            } catch (anexoErr) {
              console.warn(`Erro ao enviar foto #${i + 1} para o SGP:`, anexoErr);
            }
          }
        }
      }

      setIsLoading(false);

      if (uploadedCount > 0) {
        Alert.alert(
          'O.S. Concluída com Éxito!',
          `A Ordem de Serviço #${osId} foi encerrada e ${uploadedCount} foto(s) foram enviadas para o SGP!`,
          [{ text: 'OK', onPress: onFinishSuccess }]
        );
      } else {
        onFinishSuccess();
      }
    } catch (error) {
      setIsLoading(false);
      onFinishSuccess();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Finalizar O.S. #{osId}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Formulário de Encerramento</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Serviço Prestado *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={servicoPrestado}
            onChangeText={setServicoPrestado}
            placeholder="Ex: Troca de conector óptico na CTO e reconfiguração do PPPoE"
            placeholderTextColor="#777"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Observação Técnica / Materiais Utilizados</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={observacao}
            onChangeText={setObservacao}
            placeholder="Ex: 50m cabo Drop, 2 conectores azul, ONU SN: ZTEG123456"
            placeholderTextColor="#777"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* SEÇÃO DE FOTOS E ANEXOS DA INSTALAÇÃO */}
        <View style={styles.photosSection}>
          <Text style={styles.sectionSubtitle}>Anexar Fotos do Serviço / Instalação</Text>
          <Text style={styles.photosTipText}>
            Tire fotos da CTO, ONU, conector ou fachada para registrar o atendimento no SGP.
          </Text>

          <View style={styles.photoActionsRow}>
            <TouchableOpacity style={styles.cameraBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
              <Feather name="camera" size={18} color="#FFF" />
              <Text style={styles.cameraBtnText}>Tirar Foto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.galleryBtn} onPress={handlePickFromGallery} activeOpacity={0.8}>
              <Feather name="image" size={18} color="#00ACC1" />
              <Text style={styles.galleryBtnText}>Galeria</Text>
            </TouchableOpacity>
          </View>

          {/* LISTA DE FOTOS ANEXADAS */}
          {photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {photos.map((item, index) => (
                <View key={item.id} style={styles.photoCard}>
                  <Image source={{ uri: item.uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => handleRemovePhoto(item.id)}
                  >
                    <Feather name="x" size={14} color="#FFF" />
                  </TouchableOpacity>
                  <Text style={styles.photoBadgeNumber}>Foto #{index + 1}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noPhotosBox}>
              <Feather name="camera" size={24} color="#555" />
              <Text style={styles.noPhotosText}>Nenhuma foto anexada ainda (opcional)</Text>
            </View>
          )}
        </View>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <TouchableOpacity
          style={styles.finishBtn}
          onPress={handleFinalize}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Feather name="check-circle" size={20} color="#FFF" />
              <Text style={styles.finishBtnText}>Encerrar O.S. e Enviar Fotos ao SGP</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#B0BEC5',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  textArea: {
    textAlignVertical: 'top',
    height: 90,
  },
  photosSection: {
    backgroundColor: '#1A1E24',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A323D',
  },
  sectionSubtitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#00ACC1',
    marginBottom: 4,
  },
  photosTipText: {
    fontSize: 12,
    color: '#8899A6',
    marginBottom: 12,
  },
  photoActionsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ACC1',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 42,
    marginRight: 10,
  },
  cameraBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 172, 193, 0.15)',
    borderColor: '#00ACC1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 42,
  },
  galleryBtnText: {
    color: '#00ACC1',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  photoCard: {
    width: 90,
    height: 90,
    borderRadius: 10,
    marginRight: 10,
    marginBottom: 10,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 82, 82, 0.9)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoBadgeNumber: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#FFF',
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 2,
    fontWeight: 'bold',
  },
  noPhotosBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12161C',
    borderRadius: 10,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#262D38',
    borderStyle: 'dashed',
  },
  noPhotosText: {
    color: '#667788',
    fontSize: 13,
    marginLeft: 8,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 13,
    marginBottom: 12,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    height: 52,
    marginTop: 8,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
});
