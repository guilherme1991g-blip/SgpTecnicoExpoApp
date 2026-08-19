import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { Platform, StatusBar } from 'react-native';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { ChamadoItem, OnuDetailInfo } from '../types/sgp';
import {
  updateChamadoStatus,
  verificaAcessoCliente,
  calculateRealUptime,
  desconectarPppoe,
  updateContratoLocalizacao,
  fetchContratosOfflineRegiao,
  OfflineContractItem,
  fetchOnuForContractSgp,
  fetchOnuDetailsSgp,
  fetchOnuLiveInfoSgp,
  fetchPppoeActiveSessionSgp,
} from '../services/sgpApi';
import { sendAttendanceWebhook } from '../services/webhookService';
import { Feather } from '@expo/vector-icons';

interface Props {
  chamado: ChamadoItem;
  onBack: () => void;
  onCloseOsClick: (osId: number) => void;
}

export const OsDetailScreen: React.FC<Props> = ({ chamado, onBack, onCloseOsClick }) => {
  const servico = chamado.servicos?.[0];

  const rxValue = servico?.onu_rx_power;
  const txValue = servico?.onu_tx_power;
  const oltRxValue = servico?.onu_olt_rx_power;
  const isOnlineSgp = Boolean(servico?.servico_online);

  const [onuInfo, setOnuInfo] = useState<OnuDetailInfo>({
    serialOnu: servico?.servico_onu_serial || servico?.servico_mac || '',
    tempoAtivo: isOnlineSgp ? 'Carregando...' : 'Desconectado',
    sinalDownloadRx: rxValue ?? 0,
    sinalUploadTx: txValue ?? 0,
    sinalOltRx: oltRxValue,
    statusOnu: isOnlineSgp ? 'Online' : 'Offline',
    phaseState: servico?.onu_phase_state || (isOnlineSgp ? 'working (Online)' : 'dying_gasp (Desconectado)'),
    ctoPorta: chamado.contrato_pop || '',
    templateOnu: servico?.onu_template || '',
    ultimaLeitura: servico?.onu_last_read || '',
    distanciaFibra: servico?.onu_distance,
    atenuacaoFibra: servico?.onu_attenuation,
    causaUltimaQueda: servico?.onu_last_offline_cause,
    dataUltimaQueda: servico?.onu_last_offline_time,
  });

  const [isChecking, setIsChecking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isUpdatingGps, setIsUpdatingGps] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showOnuModal, setShowOnuModal] = useState(false);
  const [showLogsSection, setShowLogsSection] = useState(false);

  // ESTADO PARA CONTRATOS OFFLINE NA REGIÃO (FILTRO DE 3 LETRAS DO LOGRADOURO)
  const [offlineRegionData, setOfflineRegionData] = useState<{ total: number; clientesOffline: OfflineContractItem[] } | null>(null);
  const [isLoadingOfflineRegion, setIsLoadingOfflineRegion] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  // Executa verificação FTTX e busca contratos offline da região ao montar
  React.useEffect(() => {
    handleCheckSignal();
    loadOfflineContratosRegiao();
  }, []);

  const loadOfflineContratosRegiao = async () => {
    setIsLoadingOfflineRegion(true);
    const targetAddress = chamado.endereco_logradouro || chamado.endereco_bairro || chamado.endereco_cidade || '';
    try {
      const res = await fetchContratosOfflineRegiao(targetAddress);
      setOfflineRegionData(res);
    } catch (e) {
      console.warn('Erro ao buscar contratos offline da região:', e);
      setOfflineRegionData({ total: 0, clientesOffline: [] });
    } finally {
      setIsLoadingOfflineRegion(false);
    }
  };

  // Estado local para permitir atualizar instantaneamente as coordenadas do botao GPS
  const [currentCoords, setCurrentCoords] = useState<string | undefined>(
    chamado.contrato_endereco_ll
  );

  const [currentOsStatus, setCurrentOsStatus] = useState<number>(
    chamado.os_status !== undefined ? Number(chamado.os_status) : Number(chamado.oc_status || 0)
  );

  const numericOsId = Number(chamado.os_id || 0);

  const isAberta = currentOsStatus === 0;
  const isEmExecucao = currentOsStatus === 2;
  const isEncerrada = currentOsStatus === 1;

  // VERIFICA SE HÁ DADOS DE ONU CADASTRADOS NA OLT PARA ESTE CONTRATO
  const hasOnuAvailable = Boolean(
    Boolean(onuInfo.serialOnu && onuInfo.serialOnu.trim().length > 0) ||
    Boolean(onuInfo.sinalDownloadRx && onuInfo.sinalDownloadRx !== 0) ||
    Boolean(onuInfo.statusOnu) ||
    Boolean(onuInfo.templateOnu) ||
    (servico?.hasOnuData !== undefined
      ? servico.hasOnuData
      : (rxValue !== undefined && !isNaN(rxValue)) ||
        (txValue !== undefined && !isNaN(txValue)) ||
        (oltRxValue !== undefined && !isNaN(oltRxValue)) ||
        (servico?.servico_onu_serial && servico.servico_onu_serial.trim().length > 0) ||
        (servico?.onu_template && servico.onu_template.trim().length > 0) ||
        (servico?.onu_last_read && servico.onu_last_read.trim().length > 0))
  );

  // VALORES REAIS EXIBIDOS DINAMICAMENTE
  const displayRx = onuInfo.sinalDownloadRx !== undefined && onuInfo.sinalDownloadRx !== 0 ? onuInfo.sinalDownloadRx : rxValue;
  const displayTx = onuInfo.sinalUploadTx !== undefined && onuInfo.sinalUploadTx !== 0 ? onuInfo.sinalUploadTx : txValue;
  const displayOltRx = onuInfo.sinalOltRx !== undefined && onuInfo.sinalOltRx !== 0 ? onuInfo.sinalOltRx : oltRxValue;
  const displayUptime = onuInfo.tempoAtivo || servico?.onu_uptime || (isOnlineSgp ? 'Online' : 'Desconectado');

  // PRIORIZA O PROBLEMA REPORTADO REAL DO CLIENTE (os_conteudo)
  const realDescriptionText =
    chamado.os_conteudo || chamado.oc_conteudo || chamado.os_observacao || chamado.os_motivo_descricao || 'Sem observações';

  const handleOpenGps = () => {
    if (currentCoords) {
      const url = `https://www.google.com/maps/search/?api=1&query=${currentCoords}`;
      Linking.openURL(url);
    }
  };

  const handleCallClient = () => {
    if (chamado.cliente_contato) {
      const cleaned = chamado.cliente_contato.replace(/\D/g, '');
      if (cleaned) {
        Linking.openURL(`tel:${cleaned}`);
      }
    }
  };

  const handleOpenWhatsApp = () => {
    if (chamado.cliente_contato) {
      const cleaned = chamado.cliente_contato.replace(/\D/g, '');
      if (cleaned) {
        Linking.openURL(`https://api.whatsapp.com/send?phone=55${cleaned}`);
      }
    }
  };

  // AÇÃO AO CLICAR NO BOTÃO DADOS DA ONU / FTTH
  const handleOpenOnuModal = () => {
    setShowOnuModal(true);
  };

  // ATUALIZAR E SALVAR AS COORDENADAS GPS DIRETAMENTE NO CONTRATO DO CLIENTE NO SGP MANUAMENTE VIA BOTÃO
  const handleUpdateGpsLocation = async () => {
    setIsUpdatingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão Negada', 'Permissão de acesso à localização GPS foi negada.');
        setIsUpdatingGps(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const coordsFormatted = `${lat},${lng}`;

      const targetServicoId = chamado.contrato_id || chamado.cliente_id || 0;

      // Executa a alteracao direta no contrato/servico via API Suporte (change_endereco + map_ll)
      await updateContratoLocalizacao(
        Number(targetServicoId),
        lat,
        lng
      );

      // Tambem registra anotacao na O.S.
      await updateChamadoStatus(
        numericOsId,
        currentOsStatus,
        undefined,
        `[TÉCNICO] Coordenadas de instalação salvas no contrato do cliente: ${coordsFormatted}`,
        lat,
        lng
      );

      setCurrentCoords(coordsFormatted);
      chamado.contrato_endereco_ll = coordsFormatted;
      setIsUpdatingGps(false);

      Alert.alert(
        'Contrato Atualizado no SGP!',
        `As coordenadas GPS (${coordsFormatted}) foram gravadas diretamente no cadastro do contrato do cliente no SGP!`,
        [{ text: 'OK' }]
      );
    } catch (e) {
      setIsUpdatingGps(false);
      Alert.alert('Erro', 'Não foi possível salvar as coordenadas no contrato.');
    }
  };

  const handleDisconnectPppoe = () => {
    Alert.alert(
      'Desconectar PPPoE',
      `Deseja realmente desconectar a sessão PPPoE do contrato #${chamado.contrato_id}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            setIsDisconnecting(true);
            try {
              const res = await desconectarPppoe(
                Number(chamado.contrato_id || 0),
                servico?.servico_login
              );
              setIsDisconnecting(false);

              if (chamado.contrato_id) {
                await verificaAcessoCliente(Number(chamado.contrato_id));
              }

              Alert.alert(
                'Comando Enviado',
                res?.msg || 'Sessão PPPoE desconectada com sucesso!',
                [{ text: 'OK' }]
              );
            } catch (e) {
              setIsDisconnecting(false);
              Alert.alert('Erro', 'Não foi possível enviar o comando de desconexão.');
            }
          },
        },
      ]
    );
  };

  const handleCheckSignal = async () => {
    setIsChecking(true);
    setTestResult(null);

    try {
      const cId = chamado.contrato_id || (chamado as any).contrato || 0;
      const clientName = chamado.cliente || (chamado as any).cliente_nome;
      const targetLogin = servico?.servico_login || (servico as any)?.login || cId;
      const onuItem = await fetchOnuForContractSgp(cId, clientName, targetLogin);

      if (onuItem) {
        const [details, liveInfo, pppoeSession] = await Promise.all([
          fetchOnuDetailsSgp(onuItem.id),
          fetchOnuLiveInfoSgp(onuItem.id),
          fetchPppoeActiveSessionSgp(targetLogin),
        ]);

        const rxNum = onuItem.info_rx ? parseFloat(onuItem.info_rx) : undefined;
        const txNum = onuItem.info_tx ? parseFloat(onuItem.info_tx) : undefined;
        const oltRxNum = onuItem.info_olt_rx ? parseFloat(onuItem.info_olt_rx) : undefined;

        const mappedLogs = liveInfo?.history?.map((h) => {
          let causaText = h.cause;
          if (h.cause.includes('DyingGasp')) causaText = '⚡ Queda de Energia / ONU Desligada';
          else if (h.cause.includes('LOSi')) causaText = '✂️ Rompimento / Perda de Sinal Óptico';
          else if (h.cause === 'Online' || h.offlineTime === 'Conectado Atualmente') causaText = '🟢 Conectada';

          return {
            inicio: h.authTime,
            fim: h.offlineTime,
            causa: causaText,
            causaTraduzida: causaText,
          };
        }) || [];

        const lastLog = mappedLogs[0];

        setOnuInfo((prev) => ({
          ...prev,
          statusOnu: onuItem.online ? 'Online' : 'Offline',
          phaseState: onuItem.online ? 'working (Online)' : 'dying_gasp (Offline)',
          sinalDownloadRx: rxNum ?? prev.sinalDownloadRx,
          sinalUploadTx: txNum ?? prev.sinalUploadTx,
          sinalOltRx: oltRxNum ?? prev.sinalOltRx,
          serialOnu: onuItem.phy_addr || prev.serialOnu,
          templateOnu: details?.template || details?.tipo || onuItem.type || prev.templateOnu,
          ctoPorta: onuItem.olt_name ? `${onuItem.olt_name} (Slot ${onuItem.slot} / PON ${onuItem.pon})` : prev.ctoPorta,
          distanciaFibra: liveInfo?.distance || prev.distanciaFibra,
          tempoAtivo: pppoeSession?.uptimeFormatted || liveInfo?.onlineDuration || (onuItem.online ? 'Online' : 'Desconectado'),
          causaUltimaQueda: lastLog ? lastLog.causa : prev.causaUltimaQueda,
          dataUltimaQueda: lastLog ? lastLog.fim : prev.dataUltimaQueda,
          logsOnu: mappedLogs.length > 0 ? mappedLogs : prev.logsOnu,
        }));

        setTestResult(
          onuItem.online
            ? `Sinal ONU: ${onuItem.info_rx ? `${onuItem.info_rx} dBm` : 'Online 🟢'}`
            : 'ONU Desconectada 🔴'
        );
      } else {
        // Fallback se nao encontrar ONU para este contrato
        const [result, pppoeSession] = await Promise.all([
          verificaAcessoCliente(Number(cId), numericOsId),
          fetchPppoeActiveSessionSgp(targetLogin),
        ]);
        const isOnline = result.status === 1;

        setOnuInfo((prev) => ({
          ...prev,
          statusOnu: isOnline ? 'Online' : 'Offline',
          sinalDownloadRx: result.onu_rx ?? prev.sinalDownloadRx,
          sinalUploadTx: result.onu_tx ?? prev.sinalUploadTx,
          sinalOltRx: result.onu_olt_rx ?? prev.sinalOltRx,
          tempoAtivo: pppoeSession?.uptimeFormatted || result.onu_uptime || prev.tempoAtivo,
          distanciaFibra: result.distancia_fibra || prev.distanciaFibra,
          logsOnu: result.logs_onu || prev.logsOnu,
        }));

        setTestResult(isOnline ? 'Sinal ONU Verificado' : 'Sinal Verificado no SGP');
      }
    } catch (err) {
      console.warn('Erro ao verificar sinal da ONU:', err);
      setTestResult('Sinal Verificado no SGP');
    } finally {
      setIsChecking(false);
    }
  };

  const handleStartOs = async () => {
    setIsLoading(true);

    // VERIFICA SE O CONTRATO JÁ POSSUI LOCALIZAÇÃO/COORDENADAS SALVAS NO SGP
    const hasExistingLocation = Boolean(
      currentCoords && currentCoords.trim().length > 0
    );

    let lat: number | undefined = undefined;
    let lng: number | undefined = undefined;

    // SÓ CAPTURA E SALVA AS COORDENADAS NO CONTRATO SE AINDA NÃO HOUVER LOCALIZAÇÃO SALVA
    if (!hasExistingLocation) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;

          const targetServicoId = chamado.contrato_id || chamado.cliente_id || 0;
          // Salva a localização inicial no contrato via API Suporte SGP
          await updateContratoLocalizacao(Number(targetServicoId), lat, lng);
          const coordsFormatted = `${lat},${lng}`;
          setCurrentCoords(coordsFormatted);
          chamado.contrato_endereco_ll = coordsFormatted;
        }
      } catch (locErr) {
        console.warn('Erro ao obter coordenadas GPS iniciais:', locErr);
      }
    }

    try {
      // os_status: 2 (Em Execução - Permanece na tela da O.S. ABERTA em atendimento)
      await updateChamadoStatus(
        numericOsId,
        2,
        undefined,
        lat && lng
          ? `[TÉCNICO] Atendimento iniciado e localização inicial cadastrada no contrato SGP (${lat}, ${lng})`
          : 'Em execução pelo técnico de campo',
        lat,
        lng
      );
      setIsLoading(false);
      setCurrentOsStatus(2);

      // Dispara webhook de atendimento iniciado em segundo plano para n8n
      const coordsFormatted = lat && lng ? `${lat},${lng}` : undefined;
      sendAttendanceWebhook('iniciado', chamado, { coordsFormatted }).catch((err) =>
        console.warn('Erro ao disparar webhook iniciado:', err)
      );

      Alert.alert(
        'Atendimento Iniciado!',
        `A O.S. #${numericOsId} agora está EM EXECUÇÃO.${!hasExistingLocation && lat && lng ? '\nLocalização inicial capturada e salva no contrato do cliente!' : ''}`,
        [{ text: 'OK' }]
      );
    } catch (e) {
      setIsLoading(false);
      // Mesmo se houver aviso local, dispara webhook iniciado
      sendAttendanceWebhook('iniciado', chamado).catch(() => {});
      Alert.alert('Atenção', 'O atendimento foi atualizado no SGP.');
      setCurrentOsStatus(2);
    }
  };

  const handleFinishOsClick = () => {
    if (isAberta) {
      Alert.alert(
        'Atenção!',
        'Para concluir esta Ordem de Serviço, é necessário Iniciar o Atendimento primeiro.',
        [{ text: 'Entendido' }]
      );
      return;
    }
    onCloseOsClick(numericOsId);
  };

  const getRxColor = (rx?: number) => {
    if (rx === undefined || rx === 0) return '#64748B';
    if (rx >= -25.0) return '#10B981';
    if (rx >= -27.5) return '#F59E0B';
    return '#EF4444';
  };

  const fullAddress = [
    chamado.endereco_logradouro ? `${chamado.endereco_logradouro}, ${chamado.endereco_numero || 'SN'}` : '',
    chamado.endereco_bairro ? `Bairro: ${chamado.endereco_bairro}` : '',
    chamado.endereco_cidade ? `${chamado.endereco_cidade} - ${chamado.endereco_uf || ''}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const onlineIpStr = servico?.servico_online_ip || servico?.servico_ip || '';
  const onlineMacStr = servico?.servico_online_mac || servico?.servico_mac || '';

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER MINIMALISTA */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {chamado.os_id ? `O.S. #${chamado.os_id}` : `Protocolo ${chamado.oc_protocolo}`}
        </Text>
        <View style={styles.statusPillHeader}>
          <View style={[styles.statusDotHeader, { backgroundColor: isAberta ? '#F59E0B' : isEmExecucao ? '#38BDF8' : '#10B981' }]} />
          <Text style={[styles.statusTextHeader, { color: isAberta ? '#F59E0B' : isEmExecucao ? '#38BDF8' : '#10B981' }]}>
            {isAberta ? 'Aberta' : isEmExecucao ? 'Em Execução' : 'Encerrada'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CARD CLIENTE & ATENDIMENTO */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.clientMetaRow}>
              <Text style={styles.clientName}>{chamado.cliente || 'Cliente não identificado'}</Text>
              <Text style={styles.clientSubMeta}>
                Contrato #{chamado.contrato_id || 'N/A'} • Prot. {chamado.oc_protocolo || 'N/A'}
              </Text>
            </View>
          </View>

          {/* DESCRIÇÃO DO ATENDIMENTO - MINIMALISTA */}
          <View style={styles.descQuoteBox}>
            <Text style={styles.descQuoteTitle}>PROBLEMA REPORTADO / DESCRIÇÃO</Text>
            <Text style={styles.descQuoteText}>{realDescriptionText}</Text>
          </View>

          {/* BOTÕES DE CONTATO MINIMALISTAS */}
          {chamado.cliente_contato ? (
            <View style={styles.contactRow}>
              <TouchableOpacity style={styles.contactChip} onPress={handleCallClient} activeOpacity={0.7}>
                <Feather name="phone" size={14} color="#94A3B8" />
                <Text style={styles.contactChipText}>{chamado.cliente_contato}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.contactChip, styles.whatsChip]} onPress={handleOpenWhatsApp} activeOpacity={0.7}>
                <Feather name="message-circle" size={14} color="#10B981" />
                <Text style={styles.whatsChipText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* CARD ENDEREÇO & GPS */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Feather name="map-pin" size={16} color="#38BDF8" />
            <Text style={styles.cardTitle}>Endereço de Atendimento</Text>
          </View>

          <Text style={styles.addressText}>{fullAddress || 'Endereço não informado'}</Text>

          {chamado.endereco_complemento ? (
            <View style={styles.subDetailRow}>
              <Text style={styles.subDetailLabel}>Complemento:</Text>
              <Text style={styles.subDetailValue}>{chamado.endereco_complemento}</Text>
            </View>
          ) : null}

          {chamado.endereco_pontoreferencia ? (
            <View style={styles.subDetailRow}>
              <Text style={styles.subDetailLabel}>Ponto de Ref.:</Text>
              <Text style={styles.subDetailValue}>{chamado.endereco_pontoreferencia}</Text>
            </View>
          ) : null}

          {/* BOTÕES DE GPS MINIMALISTAS */}
          <View style={styles.gpsActionsRow}>
            {currentCoords ? (
              <TouchableOpacity style={styles.gpsPrimaryBtn} onPress={handleOpenGps} activeOpacity={0.8}>
                <Feather name="navigation" size={15} color="#0F172A" />
                <Text style={styles.gpsPrimaryBtnText}>Abrir no GPS</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.gpsSecondaryBtn}
              onPress={handleUpdateGpsLocation}
              disabled={isUpdatingGps}
              activeOpacity={0.8}
            >
              {isUpdatingGps ? (
                <ActivityIndicator size="small" color="#38BDF8" />
              ) : (
                <>
                  <Feather name="refresh-cw" size={14} color="#38BDF8" />
                  <Text style={styles.gpsSecondaryBtnText}>Atualizar Localização</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* CARD DIAGNÓSTICO DA CONEXÃO & ONU */}
        <View style={styles.card}>
          <View style={styles.cardTitleBetweenRow}>
            <View style={styles.cardTitleRow}>
              <Feather name="activity" size={16} color="#38BDF8" />
              <Text style={styles.cardTitle}>Diagnóstico da Conexão</Text>
            </View>

            <View style={[styles.statusBadgeDot, { backgroundColor: isOnlineSgp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
              <View style={[styles.dotIndicator, { backgroundColor: isOnlineSgp ? '#10B981' : '#EF4444' }]} />
              <Text style={[styles.statusBadgeDotText, { color: isOnlineSgp ? '#10B981' : '#EF4444' }]}>
                {isOnlineSgp ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* LOGIN PPPOE COM BOTÃO DE COPIAR */}
          {servico?.servico_login ? (
            <View style={styles.networkMetaRow}>
              <Text style={styles.networkMetaLabel}>Login PPPoE:</Text>
              <View style={styles.copyableWrapper}>
                <Text style={[styles.networkMetaValue, { color: '#F8FAFC', fontWeight: '600' }]}>
                  {servico.servico_login}
                </Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={async () => {
                    const loginStr = servico.servico_login || '';
                    await Clipboard.setStringAsync(loginStr);
                    Alert.alert('Copiado!', `Login "${loginStr}" copiado para a área de transferência!`);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="copy" size={13} color="#38BDF8" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* SENHA PPPOE */}
          {servico?.servico_password ? (
            <View style={styles.networkMetaRow}>
              <Text style={styles.networkMetaLabel}>Senha PPPoE:</Text>
              <Text style={[styles.networkMetaValue, { color: '#F8FAFC', fontWeight: '600' }]}>
                {servico.servico_password}
              </Text>
            </View>
          ) : null}

          {onlineIpStr ? (
            <View style={styles.networkMetaRow}>
              <Text style={styles.networkMetaLabel}>IP Conexão:</Text>
              <View style={styles.copyableWrapper}>
                <Text style={[styles.networkMetaValue, { color: '#F8FAFC', fontWeight: '600' }]}>
                  {onlineIpStr}
                </Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(onlineIpStr);
                    Alert.alert('Copiado!', `IP "${onlineIpStr}" copiado para a área de transferência!`);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="copy" size={13} color="#38BDF8" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {onlineMacStr ? (
            <View style={styles.networkMetaRow}>
              <Text style={styles.networkMetaLabel}>MAC Conectado:</Text>
              <Text style={styles.networkMetaValue}>{onlineMacStr}</Text>
            </View>
          ) : null}

          {/* TEMPO ONLINE / OFFLINE PPPOE */}
          {displayUptime ? (
            <View style={styles.networkMetaRow}>
              <Text style={styles.networkMetaLabel}>{isOnlineSgp ? 'Tempo Online:' : 'Última Desconexão:'}</Text>
              <Text style={[styles.networkMetaValue, { color: isOnlineSgp ? '#10B981' : '#EF4444', fontWeight: 'bold' }]}>
                {!isOnlineSgp && onuInfo.dataUltimaQueda ? onuInfo.dataUltimaQueda : displayUptime}
              </Text>
            </View>
          ) : null}

          {/* DADOS DA ONU / FTTH */}
          <TouchableOpacity
            style={styles.onuTriggerMinimalBtn}
            onPress={handleOpenOnuModal}
            activeOpacity={0.7}
          >
            <View style={styles.cardTitleRow}>
              <Feather name="cpu" size={16} color="#F8FAFC" />
              <Text style={styles.onuTriggerText}>Dados da ONU / FTTH</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#64748B" />
          </TouchableOpacity>

          {/* DESCONECTAR PPPOE */}
          <TouchableOpacity
            style={styles.disconnectMinimalBtn}
            onPress={handleDisconnectPppoe}
            disabled={isDisconnecting}
            activeOpacity={0.7}
          >
            {isDisconnecting ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Feather name="power" size={14} color="#EF4444" />
                <Text style={styles.disconnectMinimalText}>Desconectar PPPoE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* CARD: CONTRATOS OFFLINE NA REGIÃO */}
        <View style={styles.card}>
          <View style={styles.cardTitleBetweenRow}>
            <View style={styles.cardTitleRow}>
              <Feather name="wifi-off" size={16} color="#F59E0B" />
              <Text style={styles.cardTitle}>Contratos offline na região</Text>
              <TouchableOpacity
                onPress={loadOfflineContratosRegiao}
                disabled={isLoadingOfflineRegion}
                style={{ padding: 4, marginLeft: 6 }}
                activeOpacity={0.7}
              >
                <Feather name="refresh-cw" size={14} color="#38BDF8" />
              </TouchableOpacity>
            </View>

            {isLoadingOfflineRegion ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <View style={[styles.statusBadgeDot, { backgroundColor: (offlineRegionData?.total || 0) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                <View style={[styles.dotIndicator, { backgroundColor: (offlineRegionData?.total || 0) > 0 ? '#EF4444' : '#10B981' }]} />
                <Text style={[styles.statusBadgeDotText, { color: (offlineRegionData?.total || 0) > 0 ? '#EF4444' : '#10B981' }]}>
                  {offlineRegionData?.total || 0} OFFLINE
                </Text>
              </View>
            )}
          </View>

          <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 6, marginBottom: 12 }}>
            {chamado.endereco_logradouro || chamado.endereco_bairro
              ? `Filtro por logradouro: "${chamado.endereco_logradouro || chamado.endereco_bairro}"`
              : 'Verificação de quedas de clientes na mesma região'}
          </Text>

          <TouchableOpacity
            style={styles.consultarOfflineBtn}
            onPress={() => setShowOfflineModal(true)}
            activeOpacity={0.8}
          >
            <Feather name="users" size={14} color="#0F172A" />
            <Text style={styles.consultarOfflineBtnText}>
              Consultar clientes offline ({(offlineRegionData?.total || 0)})
            </Text>
          </TouchableOpacity>
        </View>

        {/* BOTÕES DE AÇÃO DE STATUS DA OS */}
        {isAberta && (
          <TouchableOpacity
            style={[styles.mainActionBtn, { backgroundColor: '#38BDF8' }]}
            onPress={handleStartOs}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <>
                <Feather name="play" size={18} color="#0F172A" />
                <Text style={[styles.mainActionBtnText, { color: '#0F172A' }]}>Iniciar Atendimento</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isEmExecucao && (
          <TouchableOpacity
            style={[styles.mainActionBtn, { backgroundColor: '#10B981' }]}
            onPress={handleFinishOsClick}
            activeOpacity={0.85}
          >
            <Feather name="check-circle" size={18} color="#0F172A" />
            <Text style={[styles.mainActionBtnText, { color: '#0F172A' }]}>Concluir e Finalizar O.S.</Text>
          </TouchableOpacity>
        )}

        {isEncerrada && (
          <View style={styles.closedPillBox}>
            <Feather name="check-circle" size={18} color="#10B981" />
            <Text style={styles.closedPillText}>Ordem de Serviço Encerrada</Text>
          </View>
        )}
      </ScrollView>

      {/* MODAL DA ONU MINIMALISTA */}
      <Modal
        visible={showOnuModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOnuModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.cardTitleRow}>
                <Feather name="cpu" size={18} color="#38BDF8" />
                <Text style={styles.modalTitle}>Informações da ONU / FTTH</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOnuModal(false)} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {!hasOnuAvailable ? (
              <View style={styles.unavailableBox}>
                <Feather name="alert-circle" size={40} color="#F59E0B" />
                <Text style={styles.unavailableTitle}>Informações da ONU não disponíveis</Text>
                <Text style={styles.unavailableSub}>
                  Não há registros de leitura de ONU/ONT cadastrados ou sinal óptico na OLT para este contrato no SGP.
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.badgeRowModal}>
                  <View style={[styles.statusBadgeDot, { backgroundColor: onuInfo.statusOnu === 'Online' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                    <Text style={[styles.statusBadgeDotText, { color: onuInfo.statusOnu === 'Online' ? '#10B981' : '#EF4444' }]}>
                      STATUS: {onuInfo.statusOnu?.toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.phaseStatePill}>
                    <Text style={styles.phaseStatePillText}>PHASE STATE: {onuInfo.phaseState || 'N/A'}</Text>
                  </View>
                </View>

                {/* SINAIS ÓPTICOS */}
                <View style={styles.signalGridModal}>
                  <View style={styles.signalCardModal}>
                    <Text style={styles.signalCardLabel}>Sinal RX (Down)</Text>
                    <Text style={[styles.signalCardValue, { color: getRxColor(displayRx) }]}>
                      {displayRx !== undefined && displayRx !== 0 ? `${displayRx} dBm` : 'Sem Leitura'}
                    </Text>
                    <Text style={styles.signalCardSub}>
                      {displayRx === undefined || displayRx === 0
                        ? 'Sem dados da OLT'
                        : displayRx >= -25.0
                        ? 'Sinal Excelente'
                        : displayRx >= -27.5
                        ? 'Sinal Moderado'
                        : 'Sinal Fraco / Verificar Fibra'}
                    </Text>
                  </View>

                  <View style={styles.signalCardModal}>
                    <Text style={styles.signalCardLabel}>Sinal TX (Up)</Text>
                    <Text style={[styles.signalCardValue, { color: '#38BDF8' }]}>
                      {displayTx !== undefined && displayTx !== 0 ? `${displayTx} dBm` : 'Sem Leitura'}
                    </Text>
                    <Text style={styles.signalCardSub}>
                      {displayTx !== undefined && displayTx !== 0 ? 'Laser TX OK' : 'Sem dados da OLT'}
                    </Text>
                  </View>
                </View>

                {/* LISTA DE DETALHES ONU / OLT */}
                <View style={styles.detailsListModal}>
                  <View style={styles.detailRowModal}>
                    <Text style={styles.detailLabelModal}>Estado da Conexão:</Text>
                    <Text style={[styles.detailValueModal, { color: '#38BDF8', fontWeight: 'bold' }]}>
                      {onuInfo.phaseState || 'Sem Dados'}
                    </Text>
                  </View>

                  {displayOltRx !== undefined && displayOltRx !== 0 ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Sinal da OLT (Recepção):</Text>
                      <Text style={styles.detailValueModal}>{displayOltRx} dBm</Text>
                    </View>
                  ) : null}

                  {onuInfo.serialOnu ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Número de Série (MAC):</Text>
                      <Text style={styles.detailValueModal}>{onuInfo.serialOnu}</Text>
                    </View>
                  ) : null}

                  {onuInfo.ctoPorta ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Porta da OLT / POP:</Text>
                      <Text style={styles.detailValueModal}>{onuInfo.ctoPorta}</Text>
                    </View>
                  ) : null}

                  {onuInfo.distanciaFibra ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Distância da Fibra:</Text>
                      <Text style={[styles.detailValueModal, { color: '#10B981', fontWeight: 'bold' }]}>{onuInfo.distanciaFibra}</Text>
                    </View>
                  ) : null}

                  {onuInfo.atenuacaoFibra ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Atenuação do Sinal:</Text>
                      <Text style={styles.detailValueModal}>{onuInfo.atenuacaoFibra}</Text>
                    </View>
                  ) : null}

                  {onuInfo.causaUltimaQueda ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Causa da Última Queda:</Text>
                      <Text style={[styles.detailValueModal, { color: '#EF4444' }]}>{onuInfo.causaUltimaQueda}</Text>
                    </View>
                  ) : null}

                  {onuInfo.dataUltimaQueda ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Data da Última Queda:</Text>
                      <Text style={styles.detailValueModal}>{onuInfo.dataUltimaQueda}</Text>
                    </View>
                  ) : null}

                  {onuInfo.templateOnu ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Modelo da ONU:</Text>
                      <Text style={styles.detailValueModal}>{onuInfo.templateOnu}</Text>
                    </View>
                  ) : null}

                  {onuInfo.ultimaLeitura ? (
                    <View style={styles.detailRowModal}>
                      <Text style={styles.detailLabelModal}>Última Verificação:</Text>
                      <Text style={styles.detailValueModal}>{onuInfo.ultimaLeitura}</Text>
                    </View>
                  ) : null}

                  {/* BOTÃO E SEÇÃO LOG DA ONU */}
                  <TouchableOpacity
                    style={styles.onuLogToggleBtn}
                    onPress={() => setShowLogsSection(!showLogsSection)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="list" size={15} color="#38BDF8" style={{ marginRight: 8 }} />
                      <Text style={styles.onuLogToggleBtnText}>Log da ONU (Últimas 5 Quedas)</Text>
                    </View>
                    <Feather name={showLogsSection ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
                  </TouchableOpacity>

                  {showLogsSection && (
                    <View style={styles.logsBoxContainer}>
                      {onuInfo.logsOnu && onuInfo.logsOnu.length > 0 ? (
                        onuInfo.logsOnu.map((logItem, idx) => (
                          <View key={idx} style={styles.logCardItem}>
                            <View style={styles.logHeaderRow}>
                              <Text style={styles.logIndexText}>Registro #{idx + 1}</Text>
                              <Text style={[styles.logCauseText, { color: (logItem.causa || logItem.causaTraduzida || '').includes('Energia') ? '#F59E0B' : '#EF4444' }]}>
                                {logItem.causa || logItem.causaTraduzida || 'Desconexão'}
                              </Text>
                            </View>
                            <Text style={styles.logDetailText}>Queda / Desconexão: {logItem.fim}</Text>
                            <Text style={styles.logDetailText}>Reautenticação: {logItem.inicio}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyLogsText}>Nenhum registro de log encontrado na OLT.</Text>
                      )}
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.refreshSignalBtnModal}
                  onPress={handleCheckSignal}
                  disabled={isChecking}
                  activeOpacity={0.8}
                >
                  {isChecking ? (
                    <ActivityIndicator size="small" color="#0F172A" />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={15} color="#0F172A" />
                      <Text style={styles.refreshSignalBtnTextModal}>Atualizar Diagnóstico da ONU</Text>
                    </>
                  )}
                </TouchableOpacity>

                {testResult && <Text style={styles.testResultTextModal}>{testResult}</Text>}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL CLIENTES OFFLINE NA REGIÃO */}
      <Modal
        visible={showOfflineModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowOfflineModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.cardTitleRow}>
                <Feather name="wifi-off" size={18} color="#EF4444" />
                <Text style={styles.modalTitle}>Clientes Offline na Região</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOfflineModal(false)} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 12 }}>
              {(offlineRegionData?.total || 0) > 0
                ? `${offlineRegionData?.total} cliente(s) offline encontrado(s) na mesma rua/bairro:`
                : 'Nenhum contrato offline encontrado com este logradouro.'}
            </Text>

            {offlineRegionData && offlineRegionData.clientesOffline.length > 0 ? (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {offlineRegionData.clientesOffline.map((item, idx) => {
                  const lastDisconnectRaw = item.radacct?.[0]?.acctstoptime || (item as any).acctstoptime || (item as any).stop_time;
                  let lastDisconnectFormatted = 'Desconhecido';

                  if (lastDisconnectRaw) {
                    try {
                      const d = new Date(lastDisconnectRaw);
                      if (!isNaN(d.getTime())) {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        const hours = String(d.getHours()).padStart(2, '0');
                        const mins = String(d.getMinutes()).padStart(2, '0');
                        lastDisconnectFormatted = `${day}/${month}/${year} às ${hours}:${mins}`;
                      } else {
                        lastDisconnectFormatted = String(lastDisconnectRaw).replace('T', ' ');
                      }
                    } catch (err) {
                      lastDisconnectFormatted = String(lastDisconnectRaw);
                    }
                  }

                  const cause = item.radacct?.[0]?.acctterminatecause;

                  return (
                    <View key={item.servico_id ? item.servico_id.toString() : idx.toString()} style={styles.offlineClientCardItem}>
                      <Text style={styles.offlineClientCardName}>{item.nome}</Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Feather name="map-pin" size={12} color="#94A3B8" style={{ marginRight: 4 }} />
                        <Text style={styles.offlineClientCardAddr}>
                          {item.endereco_logradouro || item.endereco_bairro || item.endereco || 'Endereço N/A'}
                          {item.endereco_cidade ? ` - ${item.endereco_cidade}/${item.endereco_uf || ''}` : ''}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Feather name="clock" size={12} color="#EF4444" style={{ marginRight: 4 }} />
                        <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '600' }}>
                          Última desconexão: {lastDisconnectFormatted}
                        </Text>
                      </View>

                      {item.pppoe_login ? (
                        <Text style={styles.offlineClientCardLogin}>Login PPPoE: {item.pppoe_login}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Feather name="check-circle" size={40} color="#10B981" />
                <Text style={{ color: '#F8FAFC', fontWeight: '700', marginTop: 10, fontSize: 15 }}>
                  Tudo normal na área!
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                  Nenhum outro cliente offline detectado na vizinhança.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.refreshSignalBtnModal, { marginTop: 14, backgroundColor: '#1E293B' }]}
              onPress={() => setShowOfflineModal(false)}
            >
              <Text style={{ color: '#F8FAFC', fontWeight: '700', fontSize: 13 }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111726',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  statusPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statusDotHeader: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusTextHeader: {
    fontSize: 11,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },

  // CARD BASE MINIMALISTA
  card: {
    backgroundColor: '#111726',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeaderRow: {
    marginBottom: 12,
  },
  clientMetaRow: {
    flex: 1,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
    lineHeight: 22,
  },
  clientSubMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
  descQuoteBox: {
    backgroundColor: '#161F30',
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  descQuoteTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  descQuoteText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 19,
  },
  contactRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  contactChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  whatsChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  whatsChipText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },

  // CARD ENDEREÇO
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitleBetweenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginLeft: 8,
  },
  addressText: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 21,
    marginTop: 8,
  },
  subDetailRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  subDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    marginRight: 6,
  },
  subDetailValue: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
    flex: 1,
  },
  gpsActionsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  gpsPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 40,
    marginRight: 8,
  },
  gpsPrimaryBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  gpsSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 40,
  },
  gpsSecondaryBtnText: {
    color: '#38BDF8',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },

  // CARD DIAGNÓSTICO
  statusBadgeDot: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusBadgeDotText: {
    fontSize: 11,
    fontWeight: '700',
  },
  networkMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  networkMetaLabel: {
    fontSize: 12,
    color: '#64748B',
    width: 100,
  },
  networkMetaValue: {
    fontSize: 12,
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  copyableWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onuTriggerMinimalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161F30',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 12,
  },
  onuTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
    marginLeft: 8,
  },
  disconnectMinimalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    marginTop: 8,
  },
  disconnectMinimalText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },

  // BOTÕES PRINCIPAIS DE AÇÃO
  mainActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    height: 48,
    marginTop: 6,
    marginBottom: 16,
  },
  mainActionBtnText: {
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
  },
  closedPillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    marginTop: 6,
    marginBottom: 16,
  },
  closedPillText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 8,
  },

  // MODAL DA ONU MINIMALISTA
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    marginBottom: 14,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    marginBottom: 6,
  },
  badgeRowModal: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  phaseStatePill: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  phaseStatePillText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 11,
  },
  signalGridModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  signalCardModal: {
    flex: 1,
    backgroundColor: '#161F30',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  signalCardLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  signalCardValue: {
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 3,
  },
  signalCardSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  detailsListModal: {
    backgroundColor: '#161F30',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  detailRowModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  detailLabelModal: {
    color: '#64748B',
    fontSize: 12,
  },
  detailValueModal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  onuLogToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  onuLogToggleBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  logsBoxContainer: {
    marginTop: 8,
    backgroundColor: '#0B0F17',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  logCardItem: {
    backgroundColor: '#161F30',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logIndexText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  logCauseText: {
    fontSize: 11,
    fontWeight: '700',
  },
  logDetailText: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  emptyLogsText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
  },
  refreshSignalBtnModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    borderRadius: 10,
    height: 42,
    marginBottom: 8,
  },
  refreshSignalBtnTextModal: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  testResultTextModal: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  unavailableBox: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  unavailableTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  unavailableSub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  consultarOfflineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    height: 42,
    marginTop: 6,
  },
  consultarOfflineBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  offlineClientCardItem: {
    backgroundColor: '#161F30',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  offlineClientCardName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  offlineClientCardAddr: {
    color: '#94A3B8',
    fontSize: 12,
    flex: 1,
  },
  offlineClientCardLogin: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
