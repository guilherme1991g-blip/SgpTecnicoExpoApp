import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Linking,
  Platform,
  StatusBar,
  Modal,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  UraClienteItem,
  UraClienteContrato,
  searchClientesSgp,
  fetchOnuFttxInfo,
  fetchContractIpByLogin,
  fetchRealOnlineLoginsSet,
  checkLoginsOnlineStatus,
  OnuFttxInfoResult,
  fetchOnuForContractSgp,
  fetchOnuDetailsSgp,
  fetchOnuLiveInfoSgp,
  fetchPppoeActiveSessionSgp,
  fetchFaturasContratoSgp,
  SgpFaturaItem,
} from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onBackToOs: () => void;
}

export const ClientSearchScreen: React.FC<Props> = ({ onBackToOs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [clientes, setClientes] = useState<UraClienteItem[]>([]);
  const [onlineLoginsSet, setOnlineLoginsSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isCheckingOnlineStatus, setIsCheckingOnlineStatus] = useState<boolean>(false);

  // ESTADOS DO MODAL DE DETALHES DO CONTRATO E DIAGNÓSTICO DA ONU
  const [selectedContract, setSelectedContract] = useState<{
    contrato: UraClienteContrato;
    cliente: UraClienteItem;
  } | null>(null);
  const [onuInfo, setOnuInfo] = useState<OnuFttxInfoResult | null>(null);
  const [activeIp, setActiveIp] = useState<string>('');
  const [isLoadingOnu, setIsLoadingOnu] = useState(false);
  const [showLogsSection, setShowLogsSection] = useState(false);

  // ESTADOS DO MODAL FINANCEIRO E FATURAS
  const [selectedFinanceContract, setSelectedFinanceContract] = useState<{
    contrato: UraClienteContrato;
    cliente: UraClienteItem;
  } | null>(null);
  const [isFinanceModalVisible, setIsFinanceModalVisible] = useState(false);
  const [isLoadingFaturas, setIsLoadingFaturas] = useState(false);
  const [faturas, setFaturas] = useState<SgpFaturaItem[]>([]);
  const [expandedPixFaturaId, setExpandedPixFaturaId] = useState<number | null>(null);

  const handleOpenFinanceModal = async (contrato: UraClienteContrato, cliente: UraClienteItem) => {
    setSelectedFinanceContract({ contrato, cliente });
    setIsFinanceModalVisible(true);
    setIsLoadingFaturas(true);
    setFaturas([]);
    setExpandedPixFaturaId(null);

    try {
      const data = await fetchFaturasContratoSgp(contrato.id);
      // Filtra faturas em aberto/não pagas
      const openFaturas = data.filter((f) => {
        const statusLower = (f.status || '').toLowerCase();
        return !statusLower.includes('pago') && !statusLower.includes('quitad') && !statusLower.includes('cancelad');
      });
      setFaturas(openFaturas.length > 0 ? openFaturas : data.slice(0, 3));
      setIsLoadingFaturas(false);
    } catch (e) {
      setIsLoadingFaturas(false);
    }
  };

  /**
   * Extrai o login PPPoE real descartando CPFs (que são apenas credenciais do portal do cliente)
   */
  const getRealPppoeLogin = (c?: UraClienteContrato): string => {
    if (!c) return '';
    const servicoLogin = c.servicos?.[0]?.login?.trim();
    const isServicoCpf = Boolean(servicoLogin && servicoLogin.match(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$|^\d{14}$/));
    if (servicoLogin && !isServicoCpf) {
      return servicoLogin;
    }

    const centralLogin = c.contratoCentralLogin?.trim();
    const isCentralCpf = Boolean(centralLogin && centralLogin.match(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$|^\d{14}$/));
    if (centralLogin && !isCentralCpf) {
      return centralLogin;
    }

    return servicoLogin || centralLogin || '';
  };

  const handlePerformSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsLoading(true);
    setHasSearched(true);
    setIsCheckingOnlineStatus(true);

    try {
      // 1. Busca os clientes no SGP URA e EXIBE OS RESULTADOS INSTANTANEAMENTE
      const results = await searchClientesSgp(q);
      setClientes(results);
      setIsLoading(false);

      // 2. Extrai logins dos contratos encontrados para validar status online no RADIUS em segundo plano
      const extractedLogins: string[] = [];
      results.forEach((cliente) => {
        cliente.contratos?.forEach((contrato) => {
          const login = getRealPppoeLogin(contrato);
          if (login && login !== 'Sem PPPoE') {
            extractedLogins.push(login);
          }
        });
      });

      // 3. Atualiza o status online/offline de forma assíncrona em segundo plano exibindo CARREGANDO...
      if (extractedLogins.length > 0) {
        Promise.all([
          checkLoginsOnlineStatus(extractedLogins),
          fetchRealOnlineLoginsSet(false),
        ]).then(([specificOnlineSet, bulkOnlineSet]: [Set<string>, Set<string>]) => {
          const mergedOnlineSet = new Set<string>([
            ...Array.from(specificOnlineSet),
            ...Array.from(bulkOnlineSet),
          ]);
          setOnlineLoginsSet(mergedOnlineSet);
          setIsCheckingOnlineStatus(false);
        }).catch(() => {
          setIsCheckingOnlineStatus(false);
        });
      } else {
        setIsCheckingOnlineStatus(false);
      }
    } catch (err) {
      setIsLoading(false);
      setIsCheckingOnlineStatus(false);
      setClientes([]);
    }
  };

  const handleOpenPhone = (phone?: string) => {
    if (!phone) return;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned) {
      Linking.openURL(`tel:${cleaned}`);
    }
  };

  const handleOpenWhatsApp = (phone?: string) => {
    if (!phone) return;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned) {
      Linking.openURL(`https://api.whatsapp.com/send?phone=55${cleaned}`);
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copiado!', `${label} "${text}" copiado para a área de transferência.`);
  };

  const handleOpenContractDetails = async (c: UraClienteContrato, cliente: UraClienteItem) => {
    setSelectedContract({ contrato: c, cliente });
    setOnuInfo(null);
    setActiveIp('');
    setShowLogsSection(false);
    setIsLoadingOnu(true);

    const loginStr = getRealPppoeLogin(c);
    const clientName = cliente.nome;

    try {
      // 1. Busca a ONU vinculada ao ID do contrato no SGP
      const onuItem = await fetchOnuForContractSgp(c.id, clientName, loginStr);

      if (onuItem) {
        // 2. Busca os detalhes, diagnostico ao vivo e extrato de tráfego RADIUS
        const [details, liveInfo, ipRes, pppoeSession] = await Promise.all([
          fetchOnuDetailsSgp(onuItem.id),
          fetchOnuLiveInfoSgp(onuItem.id),
          fetchContractIpByLogin(loginStr),
          fetchPppoeActiveSessionSgp(loginStr || c.id),
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

        setOnuInfo({
          hasOnuData: true,
          statusOnu: onuItem.online ? 'Online' : 'Offline',
          phaseState: onuItem.online ? 'working (Online)' : 'dying_gasp (Offline)',
          sinalDownloadRx: rxNum,
          sinalUploadTx: txNum,
          sinalOltRx: oltRxNum,
          serialOnu: onuItem.phy_addr,
          ctoPorta: onuItem.olt_name ? `${onuItem.olt_name} (Slot ${onuItem.slot} / PON ${onuItem.pon})` : undefined,
          templateOnu: details?.template || details?.tipo || onuItem.type,
          distanciaFibra: liveInfo?.distance,
          tempoAtivo: pppoeSession?.uptimeFormatted || liveInfo?.onlineDuration || (onuItem.online ? 'Online' : 'Desconectado'),
          causaUltimaQueda: lastLog ? lastLog.causa : undefined,
          dataUltimaQueda: lastLog ? lastLog.fim : undefined,
          logsOnu: mappedLogs,
          // Compatibilidade OnuFttxInfoResult
          onu_rx_power: rxNum,
          onu_tx_power: txNum,
          onu_olt_rx_power: oltRxNum,
          onu_distance: liveInfo?.distance,
          onu_online_duration: pppoeSession?.uptimeFormatted || liveInfo?.onlineDuration,
          onu_phase_state: onuItem.online ? 'working (Online)' : 'dying_gasp (Offline)',
          onu_last_offline_cause: lastLog ? lastLog.causa : undefined,
          onu_last_offline_time: lastLog ? lastLog.fim : undefined,
        } as any);

        if (ipRes) setActiveIp(ipRes);
      } else {
        // Fallback se nao encontrar ONU por contrato
        const servicoId = c.servicos?.[0]?.id || c.id;
        const [info, ipRes] = await Promise.all([
          fetchOnuFttxInfo(servicoId, true),
          fetchContractIpByLogin(loginStr),
        ]);
        setOnuInfo(info);
        if (ipRes) setActiveIp(ipRes);
      }
    } catch (e) {
      console.warn('Erro ao buscar ONU no contrato do cliente:', e);
    } finally {
      setIsLoadingOnu(false);
    }
  };

  const renderClienteCard = ({ item }: { item: UraClienteItem }) => {
    const phone = item.contatos?.celulares?.[0] || item.contatos?.telefones?.[0] || '';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.clientIconCircle}>
            <Feather name="user" size={18} color="#38BDF8" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.clientName}>{item.nome}</Text>
            {item.cpfcnpj ? (
              <Text style={styles.clientCpf}>{item.cpfcnpj} • {item.tipo || 'Pessoa Física'}</Text>
            ) : null}
          </View>
        </View>

        {/* ENDEREÇO */}
        {item.endereco ? (
          <View style={styles.addressBox}>
            <View style={styles.addressRow}>
              <Feather name="map-pin" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
              <Text style={styles.addressText}>
                {item.endereco.logradouro || ''}
                {item.endereco.numero ? `, ${item.endereco.numero}` : ''}
                {item.endereco.bairro ? ` - ${item.endereco.bairro}` : ''}
                {item.endereco.cidade ? `, ${item.endereco.cidade}/${item.endereco.uf || ''}` : ''}
              </Text>
            </View>
            {item.endereco.complemento ? (
              <Text style={styles.complementText}>Ref: {item.endereco.complemento}</Text>
            ) : null}
          </View>
        ) : null}

        {/* TELEFONES / CONTATO */}
        {phone ? (
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactChip}
              onPress={() => handleOpenPhone(phone)}
              activeOpacity={0.7}
            >
              <Feather name="phone" size={12} color="#38BDF8" />
              <Text style={styles.contactChipText}>{phone}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactChip, styles.whatsChip]}
              onPress={() => handleOpenWhatsApp(phone)}
              activeOpacity={0.7}
            >
              <Feather name="message-circle" size={12} color="#10B981" />
              <Text style={styles.whatsChipText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* CONTRATOS */}
        {item.contratos && item.contratos.length > 0 ? (
          <View style={styles.contractsContainer}>
            <Text style={styles.contractsTitle}>Contratos Vinculados ({item.contratos.length}):</Text>
            {item.contratos.map((c) => {
              const servico = c.servicos?.[0];
              const loginStr = getRealPppoeLogin(c) || 'Sem PPPoE';
              const servicoIp = (servico?.ip || '').trim();
              const isOnlineReal =
                loginStr !== 'Sem PPPoE'
                  ? onlineLoginsSet.has(loginStr.toLowerCase()) || (servicoIp.length > 0 && servicoIp !== '0.0.0.0')
                  : false;

              return (
                <View key={c.id} style={styles.contractBadgeCard}>
                  <View style={styles.contractBadgeHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contractIdText}>Contrato #{c.id}</Text>
                      <Text style={styles.pppoeText}>PPPoE: {loginStr}</Text>
                    </View>

                    {/* STATUS ONLINE / OFFLINE BADGE REAL */}
                    {isCheckingOnlineStatus && !onlineLoginsSet.has(loginStr.toLowerCase()) && (!servicoIp || servicoIp === '0.0.0.0') ? (
                      <View style={[styles.statusBadgeDot, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                        <ActivityIndicator size="small" color="#F59E0B" style={{ marginRight: 4 }} />
                        <Text style={[styles.statusBadgeDotText, { color: '#F59E0B' }]}>
                          CARREGANDO...
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadgeDot, { backgroundColor: isOnlineReal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                        <View style={[styles.dotIndicator, { backgroundColor: isOnlineReal ? '#10B981' : '#EF4444' }]} />
                        <Text style={[styles.statusBadgeDotText, { color: isOnlineReal ? '#10B981' : '#EF4444' }]}>
                          {isOnlineReal ? 'ONLINE' : 'OFFLINE'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {servico?.plano?.descricao || c.plano ? (
                    <Text style={styles.planText}>Plano: {servico?.plano?.descricao || c.plano}</Text>
                  ) : null}

                  {c.vencimento ? (
                    <Text style={styles.vencimentotext}>Vencimento: Dia {c.vencimento}</Text>
                  ) : null}

                  {/* BOTÕES DE AÇÃO DO CONTRATO: DETALHES & FINANCEIRO */}
                  <View style={{ flexDirection: 'row', marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.openContractBtn, { flex: 1, marginRight: 4, marginTop: 0 }]}
                      onPress={() => handleOpenContractDetails(c, item)}
                      activeOpacity={0.8}
                    >
                      <Feather name="info" size={13} color="#0F172A" style={{ marginRight: 4 }} />
                      <Text style={styles.openContractBtnText}>Detalhes & ONU</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.financeBtn, { flex: 1, marginLeft: 4 }]}
                      onPress={() => handleOpenFinanceModal(c, item)}
                      activeOpacity={0.8}
                    >
                      <Feather name="dollar-sign" size={13} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={styles.financeBtnText}>Financeiro</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  const selectedServico = selectedContract?.contrato.servicos?.[0];
  const loginCopy = getRealPppoeLogin(selectedContract?.contrato);
  const senhaCopy = selectedContract?.contrato.contratoCentralSenha || selectedServico?.senha || '';
  const ipCopy = activeIp || selectedServico?.ip || '';
  const serialCopy = selectedServico?.serial || selectedServico?.onu?.serial || '';

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <TouchableOpacity style={styles.backBtn} onPress={onBackToOs} activeOpacity={0.7}>
            <Feather name="arrow-left" size={20} color="#F8FAFC" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Buscar Clientes</Text>
            <Text style={styles.headerSubtitle}>Consulta direta na base do SGP</Text>
          </View>
        </View>
      </View>

      {/* SEARCH BAR HEADER */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#64748B" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Digite o nome do cliente..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handlePerformSearch}
          returnKeyType="search"
          autoCapitalize="words"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <Feather name="x-circle" size={16} color="#64748B" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.searchBtn} onPress={handlePerformSearch} activeOpacity={0.8}>
          <Text style={styles.searchBtnText}>Buscar</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT LIST */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Buscando registros no SGP...</Text>
        </View>
      ) : clientes.length > 0 ? (
        <FlatList
          data={clientes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderClienteCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : hasSearched ? (
        <View style={styles.emptyContainer}>
          <Feather name="user-x" size={44} color="#64748B" />
          <Text style={styles.emptyTitle}>Nenhum Cliente Encontrado</Text>
          <Text style={styles.emptySub}>
            Não foram localizados contratos para a busca "{searchQuery}".
          </Text>
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Feather name="search" size={44} color="#334155" />
          <Text style={styles.emptyTitle}>Pesquise por Nome</Text>
          <Text style={styles.emptySub}>
            Digite acima o nome ou sobrenome do cliente para visualizar os contratos, dados de acesso e sinal de ONU.
          </Text>
        </View>
      )}

      {/* MODAL DETALHES DO CONTRATO E INFORMACÕES DA ONU (IGUAL OCORRÊNCIA) */}
      <Modal
        visible={Boolean(selectedContract)}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedContract(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* MODAL HEADER */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedContract?.cliente.nome}</Text>
                <Text style={styles.modalSubTitle}>Contrato #{selectedContract?.contrato.id}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setSelectedContract(null)}
              >
                <Feather name="x" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* SEÇÃO CONTRATO & DADOS DE CONEXÃO */}
              <View style={styles.modalSectionCard}>
                <Text style={styles.modalSectionTitle}>🔑 Dados de Conexão (PPPoE)</Text>

                {/* LOGIN PPPOE */}
                <View style={styles.copyableRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.copyableLabel}>Login PPPoE</Text>
                    <Text style={styles.copyableValue}>{loginCopy || 'Não Informado'}</Text>
                  </View>
                  {loginCopy ? (
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => handleCopyText(loginCopy, 'Login PPPoE')}
                      activeOpacity={0.7}
                    >
                      <Feather name="copy" size={14} color="#38BDF8" />
                      <Text style={styles.copyBtnText}>Copiar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* SENHA PPPOE */}
                <View style={styles.copyableRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.copyableLabel}>Senha PPPoE</Text>
                    <Text style={styles.copyableValue}>{senhaCopy || 'Não Informada'}</Text>
                  </View>
                  {senhaCopy ? (
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => handleCopyText(senhaCopy, 'Senha PPPoE')}
                      activeOpacity={0.7}
                    >
                      <Feather name="copy" size={14} color="#38BDF8" />
                      <Text style={styles.copyBtnText}>Copiar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* IP CONEXÃO */}
                <View style={styles.copyableRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.copyableLabel}>IP Conexão</Text>
                    <Text style={styles.copyableValue}>{ipCopy || 'IP Dinâmico / Não Atribuído'}</Text>
                  </View>
                  {ipCopy ? (
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => handleCopyText(ipCopy, 'IP Conexão')}
                      activeOpacity={0.7}
                    >
                      <Feather name="copy" size={14} color="#38BDF8" />
                      <Text style={styles.copyBtnText}>Copiar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* SEÇÃO INFORMAÇÕES DA ONU / FTTX (IGUAL OCORRÊNCIA) */}
              <View style={styles.modalSectionCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="cpu" size={16} color="#38BDF8" style={{ marginRight: 6 }} />
                    <Text style={styles.modalSectionTitle}>Informações da ONU (FTTX)</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleOpenContractDetails(selectedContract!.contrato, selectedContract!.cliente)}
                    disabled={isLoadingOnu}
                    style={{ padding: 4 }}
                  >
                    <Feather name="refresh-cw" size={14} color="#38BDF8" />
                  </TouchableOpacity>
                </View>

                {isLoadingOnu ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#F59E0B" />
                    <Text style={{ color: '#94A3B8', marginTop: 8, fontSize: 12 }}>Diagnosticando sinal na OLT...</Text>
                  </View>
                ) : onuInfo ? (
                  <View>
                    {/* STATUS E SINAL ÓPTICO GRID */}
                    <View style={styles.onuGridRow}>
                      <View style={styles.onuGridCol}>
                        <Text style={styles.copyableLabel}>Status ONU</Text>
                        <Text style={[styles.onuStatusValue, { color: (onuInfo.onu_phase_state || '').toLowerCase().includes('online') ? '#10B981' : '#EF4444' }]}>
                          {onuInfo.onu_phase_state || 'Online'}
                        </Text>
                      </View>

                      <View style={styles.onuGridCol}>
                        <Text style={styles.copyableLabel}>Sinal RX (ONU)</Text>
                        <Text style={[styles.onuSignalValue, { color: onuInfo.onu_rx_power ? (onuInfo.onu_rx_power < -27 ? '#EF4444' : '#10B981') : '#F8FAFC' }]}>
                          {onuInfo.onu_rx_power !== undefined ? `${onuInfo.onu_rx_power} dBm` : '-'}
                        </Text>
                      </View>

                      <View style={styles.onuGridCol}>
                        <Text style={styles.copyableLabel}>Sinal TX (ONU)</Text>
                        <Text style={styles.onuSignalValue}>{onuInfo.onu_tx_power !== undefined ? `${onuInfo.onu_tx_power} dBm` : '-'}</Text>
                      </View>
                    </View>

                    {/* DETALHES TÉCNICOS ADICIONAIS */}
                    <View style={{ marginTop: 12 }}>
                      <View style={styles.detailRowModal}>
                        <Text style={styles.detailLabelModal}>
                          {((onuInfo as any).statusOnu || onuInfo.onu_phase_state || '').toLowerCase().includes('off') ? 'Última Desconexão:' : 'Tempo Online (Uptime):'}
                        </Text>
                        <Text style={[styles.detailValueModal, { color: ((onuInfo as any).statusOnu || onuInfo.onu_phase_state || '').toLowerCase().includes('off') ? '#EF4444' : '#10B981', fontWeight: 'bold' }]}>
                          {(onuInfo as any).tempoAtivo || onuInfo.onu_online_duration || 'Offline'}
                        </Text>
                      </View>

                      {onuInfo.onu_olt_rx_power !== undefined ? (
                        <View style={styles.detailRowModal}>
                          <Text style={styles.detailLabelModal}>Sinal na OLT (RX):</Text>
                          <Text style={styles.detailValueModal}>{onuInfo.onu_olt_rx_power} dBm</Text>
                        </View>
                      ) : null}

                      {onuInfo.onu_distance ? (
                        <View style={styles.detailRowModal}>
                          <Text style={styles.detailLabelModal}>Distância da OLT:</Text>
                          <Text style={styles.detailValueModal}>{onuInfo.onu_distance}</Text>
                        </View>
                      ) : null}

                      {onuInfo.onu_attenuation ? (
                        <View style={styles.detailRowModal}>
                          <Text style={styles.detailLabelModal}>Atenuação da Fibra:</Text>
                          <Text style={styles.detailValueModal}>{onuInfo.onu_attenuation}</Text>
                        </View>
                      ) : null}

                      {serialCopy ? (
                        <View style={styles.detailRowModal}>
                          <Text style={styles.detailLabelModal}>Serial da ONU:</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.detailValueModal}>{serialCopy}</Text>
                            <TouchableOpacity
                              onPress={() => handleCopyText(serialCopy, 'Serial ONU')}
                              style={{ marginLeft: 6 }}
                            >
                              <Feather name="copy" size={12} color="#38BDF8" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}

                      {onuInfo.onu_last_offline_cause ? (
                        <View style={styles.detailRowModal}>
                          <Text style={styles.detailLabelModal}>Causa Última Queda:</Text>
                          <Text style={[styles.detailValueModal, { color: '#EF4444', fontWeight: 'bold' }]}>
                            {onuInfo.onu_last_offline_cause}
                          </Text>
                        </View>
                      ) : null}

                      {onuInfo.onu_last_offline_time ? (
                        <View style={styles.detailRowModal}>
                          <Text style={styles.detailLabelModal}>Data da Última Queda:</Text>
                          <Text style={styles.detailValueModal}>{onuInfo.onu_last_offline_time}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* BOTÃO E SEÇÃO EXPANSÍVEL DO LOG DA ONU */}
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
                              {logItem.fim ? (
                                <Text style={styles.logDetailText}>Queda / Desconexão: {logItem.fim}</Text>
                              ) : logItem.dataInicio ? (
                                <Text style={styles.logDetailText}>Desconexão: {logItem.dataInicio}</Text>
                              ) : null}
                              {logItem.inicio ? (
                                <Text style={styles.logDetailText}>Reautenticação: {logItem.inicio}</Text>
                              ) : logItem.duracao ? (
                                <Text style={styles.logDetailText}>Duração offline: {logItem.duracao}</Text>
                              ) : null}
                            </View>
                          ))
                        ) : (
                          <Text style={styles.emptyLogsText}>Nenhum registro de log encontrado na OLT.</Text>
                        )}
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={{ color: '#94A3B8', fontSize: 12 }}>Sem dados de ONU cadastrados na OLT para este contrato.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL FINANCEIRO E FATURAS */}
      <Modal
        visible={isFinanceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFinanceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* MODAL HEADER */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  Financeiro • Contrato #{selectedFinanceContract?.contrato.id}
                </Text>

                <Text style={styles.modalSubTitle} numberOfLines={1}>
                  {selectedFinanceContract?.cliente.nome}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setIsFinanceModalVisible(false)}
                style={styles.closeModalBtn}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* MODAL BODY */}
            {isLoadingFaturas ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 13 }}>
                  Carregando faturas no SGP...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.financeSectionTitle}>
                  3 Próximas Faturas (Incluindo Vencidas):
                </Text>

                {faturas && faturas.length > 0 ? (
                  faturas.map((fatura) => {
                    const isExpanded = expandedPixFaturaId === fatura.id;

                    // Formata a data de vencimento (AAAA-MM-DD -> DD/MM/AAAA)
                    let vencimentoStr = fatura.vencimento || '';
                    if (vencimentoStr.includes('-')) {
                      const parts = vencimentoStr.split('-');
                      if (parts.length === 3) {
                        vencimentoStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                      }
                    }

                    // Verifica se está vencida
                    let isVencida = false;
                    if (fatura.vencimento) {
                      const todayStr = new Date().toISOString().split('T')[0];
                      isVencida = fatura.vencimento < todayStr && fatura.statusid !== 2;
                    }

                    const valorFinal = fatura.valorcorrigido || fatura.valor || 0;

                    return (
                      <View
                        key={fatura.id}
                        style={[
                          styles.faturaCard,
                          isVencida && { borderColor: '#EF4444', borderWidth: 1.5, backgroundColor: 'rgba(239, 68, 68, 0.06)' },
                        ]}
                      >
                        {/* FATURA CARD HEADER */}
                        <View style={styles.faturaHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.faturaIdText}>
                              Fatura #{fatura.numero_documento || fatura.id}
                            </Text>

                            <Text style={styles.faturaValorText}>
                              R$ {valorFinal.toFixed(2).replace('.', ',')}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.faturaStatusBadge,
                              { backgroundColor: isVencida ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.15)' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.faturaStatusText,
                                { color: isVencida ? '#EF4444' : '#38BDF8' },
                              ]}
                            >
                              {isVencida ? '⚠️ VENCIDA' : fatura.status || 'Em Aberto'}
                            </Text>
                          </View>
                        </View>

                        {/* VENCIMENTO */}
                        <View style={styles.faturaInfoRow}>
                          <Feather name="calendar" size={12} color={isVencida ? '#EF4444' : '#94A3B8'} style={{ marginRight: 4 }} />
                          <Text style={[styles.faturaInfoText, isVencida && { color: '#EF4444', fontWeight: 'bold' }]}>
                            Vencimento: {vencimentoStr}
                          </Text>
                        </View>

                        {/* BOTÃO GERAR QR CODE PIX / ALTERNAR VISUALIZAÇÃO */}
                        {fatura.codigopix ? (
                          <TouchableOpacity
                            style={[styles.pixToggleBtn, isExpanded && styles.pixToggleBtnActive]}
                            onPress={() => setExpandedPixFaturaId(isExpanded ? null : fatura.id)}
                            activeOpacity={0.8}
                          >
                            <Feather name="grid" size={15} color={isExpanded ? '#0D1117' : '#10B981'} style={{ marginRight: 6 }} />
                            <Text style={[styles.pixToggleBtnText, isExpanded && styles.pixToggleBtnTextActive]}>
                              {isExpanded ? 'Ocultar QR Code PIX' : 'Gerar QR Code PIX / Copia e Cola'}
                            </Text>
                            <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={isExpanded ? '#0D1117' : '#10B981'} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        ) : (
                          <Text style={{ color: '#94A3B8', fontSize: 11, fontStyle: 'italic', marginTop: 8 }}>
                            QR Code PIX indisponível para esta fatura.
                          </Text>
                        )}

                        {/* SEÇÃO EXPANDIDA DO PIX QR CODE */}
                        {isExpanded && fatura.codigopix ? (
                          <View style={styles.pixExpandedBox}>
                            <Text style={styles.pixTitle}>Escaneie o QR Code abaixo para pagar via PIX:</Text>

                            {/* QR CODE IMAGE VIA API */}
                            <View style={styles.qrCodeImageContainer}>
                              <Image
                                source={{
                                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(fatura.codigopix)}`,
                                }}
                                style={{ width: 180, height: 180 }}
                                resizeMode="contain"
                              />
                            </View>

                            {/* PIX COPIA E COLA */}
                            <Text style={styles.pixSubTitle}>Ou copie a chave PIX (Copia e Cola):</Text>
                            <View style={styles.pixPayloadBox}>
                              <Text style={styles.pixPayloadText} numberOfLines={3}>
                                {fatura.codigopix}
                              </Text>
                            </View>

                            {/* BOTÃO COPIAR CHAVE PIX */}
                            <TouchableOpacity
                              style={styles.copyPixBtn}
                              onPress={() => {
                                Clipboard.setStringAsync(fatura.codigopix!);
                                Alert.alert('PIX Copiado!', 'O código PIX Copia e Cola foi copiado para a área de transferência.');
                              }}
                              activeOpacity={0.8}
                            >
                              <Feather name="copy" size={14} color="#0D1117" style={{ marginRight: 6 }} />
                              <Text style={styles.copyPixBtnText}>Copiar Código PIX (Copia e Cola)</Text>
                            </TouchableOpacity>

                            {/* LINHA DIGITÁVEL E BOLETO PDF */}
                            {fatura.linhadigitavel ? (
                              <TouchableOpacity
                                style={styles.copyBoletoBtn}
                                onPress={() => {
                                  Clipboard.setStringAsync(fatura.linhadigitavel!);
                                  Alert.alert('Linha Digitável Copiada!', 'A linha digitável do boleto foi copiada.');
                                }}
                                activeOpacity={0.8}
                              >
                                <Feather name="file-text" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                                <Text style={styles.copyBoletoBtnText}>Copiar Linha Digitável</Text>
                              </TouchableOpacity>
                            ) : null}

                            {fatura.link_completo ? (
                              <TouchableOpacity
                                style={styles.pdfBoletoBtn}
                                onPress={() => Linking.openURL(fatura.link_completo!)}
                                activeOpacity={0.8}
                              >
                                <Feather name="external-link" size={14} color="#F8FAFC" style={{ marginRight: 6 }} />
                                <Text style={styles.pdfBoletoBtnText}>Abrir Boleto em PDF</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                    <Feather name="check-circle" size={32} color="#10B981" />
                    <Text style={{ color: '#F8FAFC', fontWeight: 'bold', marginTop: 10, fontSize: 14 }}>
                      Nenhuma fatura em aberto!
                    </Text>
                    <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                      Este contrato não possui débitos pendentes no momento.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#111726',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 8,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 46,
    color: '#F8FAFC',
    fontSize: 14,
  },
  searchBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 6,
  },
  searchBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#111726',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  clientCpf: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  addressBox: {
    backgroundColor: '#161F30',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    color: '#CBD5E1',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  complementText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 19,
  },
  contactRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  contactChipText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  whatsChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  whatsChipText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  contractsContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  contractsTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  contractBadgeCard: {
    backgroundColor: '#161F30',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  contractBadgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  contractIdText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 13,
  },
  pppoeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
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
    marginRight: 5,
  },
  statusBadgeDotText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  planText: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
  },
  vencimentotext: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  openContractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 10,
  },
  openContractBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0B0F17',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '90%',
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
    fontSize: 17,
    fontWeight: 'bold',
  },
  modalSubTitle: {
    color: '#38BDF8',
    fontSize: 12,
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 6,
  },
  modalSectionCard: {
    backgroundColor: '#111726',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalSectionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  copyableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  copyableLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  copyableValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  copyBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  onuGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#161F30',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  onuGridCol: {
    flex: 1,
    alignItems: 'center',
  },
  onuStatusValue: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 3,
  },
  onuSignalValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 3,
  },
  detailRowModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#161F30',
  },
  detailLabelModal: {
    color: '#94A3B8',
    fontSize: 12,
  },
  detailValueModal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '500',
  },
  onuLogToggleBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  onuLogToggleBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  logsBoxContainer: {
    backgroundColor: '#161F30',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  logCardItem: {
    backgroundColor: '#0B0F17',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logIndexText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  logCauseText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  logDetailText: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
  },
  emptyLogsText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },

  financeBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  financeBtnText: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 13,
  },
  financeSectionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  faturaCard: {
    backgroundColor: '#161F30',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  faturaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faturaIdText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  faturaValorText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  faturaStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  faturaStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  faturaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  faturaInfoText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  pixToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  pixToggleBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  pixToggleBtnText: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pixToggleBtnTextActive: {
    color: '#0D1117',
    fontWeight: 'bold',
  },
  pixExpandedBox: {
    backgroundColor: '#0B0F17',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  pixTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  qrCodeImageContainer: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  pixSubTitle: {
    color: '#94A3B8',
    fontSize: 11,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pixPayloadBox: {
    backgroundColor: '#161F30',
    padding: 10,
    borderRadius: 6,
    width: '100%',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  pixPayloadText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyPixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 8,
  },
  copyPixBtnText: {
    color: '#0D1117',
    fontWeight: 'bold',
    fontSize: 13,
  },
  copyBoletoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    width: '100%',
    marginBottom: 6,
  },
  copyBoletoBtnText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pdfBoletoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    width: '100%',
  },
  pdfBoletoBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
