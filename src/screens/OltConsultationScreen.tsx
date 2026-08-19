import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import {
  fetchOltListSgp,
  fetchOnusForOltSgp,
  OltItem,
  OltOnuItem,
  fetchOnuLiveInfoSgp,
  fetchOnuFttxInfo,
  resetOnuSgp,
  deauthOnuSgp,
} from '../services/sgpApi';

interface Props {
  onBackToOs: () => void;
}

export const OltConsultationScreen: React.FC<Props> = ({ onBackToOs }) => {
  const [olts, setOlts] = useState<OltItem[]>([]);
  const [isLoadingOlts, setIsLoadingOlts] = useState(false);
  const [selectedOlt, setSelectedOlt] = useState<OltItem | null>(null);

  const [onus, setOnus] = useState<OltOnuItem[]>([]);
  const [isLoadingOnus, setIsLoadingOnus] = useState(false);

  // Filtros de busca
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | 'ONLINE' | 'OFFLINE' | 'SINAL_FRACO'>('TODAS');
  const [selectedPon, setSelectedPon] = useState<number | 'TODAS'>('TODAS');

  // Modal de Diagnóstico / Log da ONU selecionada
  const [selectedOnuForModal, setSelectedOnuForModal] = useState<OltOnuItem | null>(null);
  const [isLoadingModalDiag, setIsLoadingModalDiag] = useState(false);
  const [modalDiagData, setModalDiagData] = useState<any>(null);
  const [showLogsSection, setShowLogsSection] = useState(false);

  useEffect(() => {
    loadOlts();
  }, []);

  const loadOlts = async () => {
    setIsLoadingOlts(true);
    try {
      const data = await fetchOltListSgp();
      setOlts(data);
    } catch (e) {
      console.warn('Erro ao carregar OLTs:', e);
      setOlts([]);
    } finally {
      setIsLoadingOlts(false);
    }
  };

  const handleSelectOlt = async (olt: OltItem) => {
    setSelectedOlt(olt);
    setIsLoadingOnus(true);
    setSearchQuery('');
    setStatusFilter('TODAS');
    setSelectedPon('TODAS');

    try {
      const data = await fetchOnusForOltSgp(olt.id);
      setOnus(data);
    } catch (e) {
      console.warn(`Erro ao carregar ONUs da OLT #${olt.id}:`, e);
      setOnus([]);
    } finally {
      setIsLoadingOnus(false);
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copiado!', `${label} foi copiado para a área de transferência.`);
  };

  const [actionLoadingOnuId, setActionLoadingOnuId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<'RESET' | 'DEAUTH' | null>(null);

  const confirmResetOnu = (item: OltOnuItem) => {
    const clientName = item.service_cliente || item.description || 'Cliente';
    const mac = item.phy_addr ? ` (${item.phy_addr})` : '';

    Alert.alert(
      '🔄 Reiniciar ONU',
      `Deseja enviar o comando para reiniciar a ONU de ${clientName}${mac}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'default',
          onPress: () => executeResetOnu(item),
        },
      ]
    );
  };

  const executeResetOnu = async (item: OltOnuItem) => {
    setActionLoadingOnuId(item.id);
    setActionType('RESET');
    try {
      const res = await resetOnuSgp(item.id);
      if (res.success) {
        Alert.alert('Sucesso', res.message || `Comando enviado! A ONU de ${item.service_cliente || item.phy_addr} está sendo reiniciada.`);
      } else {
        Alert.alert('Atenção', res.message || 'Não foi possível reiniciar a ONU.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao executar o comando de reiniciar.');
    } finally {
      setActionLoadingOnuId(null);
      setActionType(null);
    }
  };

  const confirmDeauthOnu = (item: OltOnuItem) => {
    const clientName = item.service_cliente || item.description || 'Cliente';
    const mac = item.phy_addr ? ` (${item.phy_addr})` : '';

    Alert.alert(
      '⚠️ Desautorizar ONU',
      `ATENÇÃO: Desautorizar a ONU de ${clientName}${mac} removerá o cadastro da ONU na OLT. O cliente perderá a conexão. Deseja continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desautorizar',
          style: 'destructive',
          onPress: () => executeDeauthOnu(item),
        },
      ]
    );
  };

  const executeDeauthOnu = async (item: OltOnuItem) => {
    setActionLoadingOnuId(item.id);
    setActionType('DEAUTH');
    try {
      const res = await deauthOnuSgp(item.id);
      if (res.success) {
        Alert.alert('Sucesso', res.message || `ONU de ${item.service_cliente || item.phy_addr} desautorizada com sucesso!`);
        // Remove a ONU desautorizada da lista local
        setOnus((prev) => prev.filter((o) => o.id !== item.id));
        if (selectedOnuForModal?.id === item.id) {
          setSelectedOnuForModal(null);
        }
      } else {
        Alert.alert('Atenção', res.message || 'Não foi possível desautorizar a ONU.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao executar o comando de desautorizar.');
    } finally {
      setActionLoadingOnuId(null);
      setActionType(null);
    }
  };

  // Abre Modal de Diagnóstico Completo da ONU
  const handleOpenOnuDiagModal = async (item: OltOnuItem) => {
    setSelectedOnuForModal(item);
    setModalDiagData(null);
    setShowLogsSection(false);
    setIsLoadingModalDiag(true);

    try {
      const [liveInfo, fttxInfo] = await Promise.all([
        fetchOnuLiveInfoSgp(item.id).catch(() => null),
        fetchOnuFttxInfo(item.phy_addr || item.id, true).catch(() => null),
      ]);

      const mappedLogs = liveInfo?.history?.map((h) => {
        let causaText = h.cause;
        if (h.cause.includes('DyingGasp')) causaText = '⚡ Queda de Energia / ONU Desligada';
        else if (h.cause.includes('LOSi')) causaText = '✂️ Rompimento / Perda de Sinal Óptico';
        else if (h.cause === 'Online' || h.offlineTime === 'Conectado Atualmente') causaText = '🟢 Conectada';

        return {
          inicio: h.authTime,
          fim: h.offlineTime,
          causa: causaText,
        };
      }) || [];

      setModalDiagData({
        liveInfo,
        fttxInfo,
        mappedLogs,
      });
    } catch (e) {
      console.warn('Erro ao carregar diagnóstico modal da ONU:', e);
    } finally {
      setIsLoadingModalDiag(false);
    }
  };

  // Lista de PONs únicas na OLT selecionada
  const availablePons = useMemo(() => {
    const setPons = new Set<number>();
    onus.forEach((o) => {
      if (o.pon !== undefined) setPons.add(o.pon);
    });
    return Array.from(setPons).sort((a, b) => a - b);
  }, [onus]);

  // Estatísticas de Quantidade de ONUs por Porta PON
  const ponStats = useMemo(() => {
    const map: { [pon: number]: { total: number; online: number; offline: number } } = {};
    onus.forEach((o) => {
      if (o.pon !== undefined) {
        if (!map[o.pon]) {
          map[o.pon] = { total: 0, online: 0, offline: 0 };
        }
        map[o.pon].total += 1;
        if (o.online) map[o.pon].online += 1;
        else map[o.pon].offline += 1;
      }
    });
    return map;
  }, [onus]);

  // Estatísticas da OLT selecionada
  const stats = useMemo(() => {
    let onlineCount = 0;
    let offlineCount = 0;
    let badSignalCount = 0;

    onus.forEach((o) => {
      if (o.online) onlineCount++;
      else offlineCount++;

      if (o.info_rx) {
        const rx = parseFloat(o.info_rx);
        if (!isNaN(rx) && rx < -27.0) badSignalCount++;
      }
    });

    return {
      total: onus.length,
      onlineCount,
      offlineCount,
      badSignalCount,
      onlinePct: onus.length > 0 ? Math.round((onlineCount / onus.length) * 100) : 0,
    };
  }, [onus]);

  // Lista filtrada de ONUs
  const filteredOnus = useMemo(() => {
    return onus.filter((o) => {
      // 1. Filtro por PON
      if (selectedPon !== 'TODAS' && o.pon !== selectedPon) return false;

      // 2. Filtro por Status Pill
      if (statusFilter === 'ONLINE' && !o.online) return false;
      if (statusFilter === 'OFFLINE' && o.online) return false;
      if (statusFilter === 'SINAL_FRACO') {
        const rx = o.info_rx ? parseFloat(o.info_rx) : 0;
        if (isNaN(rx) || rx >= -27.0) return false;
      }

      // 3. Filtro de Busca por Texto
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const nameMatch = (o.service_cliente || o.description || '').toLowerCase().includes(q);
      const loginMatch = (o.service_login || o.login || '').toLowerCase().includes(q);
      const macMatch = (o.phy_addr || '').toLowerCase().includes(q);
      const contratoMatch = String(o.service_contrato || '').includes(q);
      const bairroMatch = (o.address?.bairro || '').toLowerCase().includes(q);
      const logradouroMatch = (o.address?.logradouro || '').toLowerCase().includes(q);
      const slotPonMatch = `slot ${o.slot} pon ${o.pon}`.toLowerCase().includes(q) || `pon ${o.pon}`.toLowerCase().includes(q);

      return nameMatch || loginMatch || macMatch || contratoMatch || bairroMatch || logradouroMatch || slotPonMatch;
    });
  }, [onus, selectedPon, statusFilter, searchQuery]);

  const getRxColor = (rxStr?: string) => {
    if (!rxStr) return '#94A3B8';
    const num = parseFloat(rxStr);
    if (isNaN(num)) return '#94A3B8';
    if (num >= -25.0) return '#10B981'; // Green
    if (num >= -27.5) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  const renderOnuItem = ({ item }: { item: OltOnuItem }) => {
    return (
      <View style={styles.onuCard}>
        {/* CARD HEADER: NOME E BADGE STATUS */}
        <View style={styles.onuCardHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.clientName} numberOfLines={1}>
              {item.service_cliente || item.description || 'Cliente Não Informado'}
            </Text>
            {item.service_contrato ? (
              <Text style={styles.contractSub}>Contrato #{item.service_contrato}</Text>
            ) : null}
          </View>

          <View style={[styles.statusBadgeDot, { backgroundColor: item.online ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
            <View style={[styles.dotIndicator, { backgroundColor: item.online ? '#10B981' : '#EF4444' }]} />
            <Text style={[styles.statusBadgeDotText, { color: item.online ? '#10B981' : '#EF4444' }]}>
              {item.online ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* LOCALIZAÇÃO E MAC SERIAL */}
        <View style={styles.metaRow}>
          <View style={styles.metaBadge}>
            <Feather name="layers" size={11} color="#38BDF8" style={{ marginRight: 4 }} />
            <Text style={styles.metaBadgeText}>
              Slot {item.slot} • PON {item.pon} • ONU #{item.onuid}
            </Text>
          </View>

          {item.phy_addr ? (
            <TouchableOpacity
              style={styles.macCopyBtn}
              onPress={() => handleCopyText(item.phy_addr, 'Serial / MAC da ONU')}
              activeOpacity={0.7}
            >
              <Feather name="cpu" size={11} color="#94A3B8" style={{ marginRight: 4 }} />
              <Text style={styles.macCopyText}>{item.phy_addr}</Text>
              <Feather name="copy" size={10} color="#38BDF8" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* DETALHES DE CONEXÃO E ENDEREÇO */}
        <View style={styles.infoBody}>
          {item.service_login || item.login ? (
            <View style={styles.infoRowText}>
              <Text style={styles.infoLabel}>Login PPPoE:</Text>
              <Text style={styles.infoValue}>{item.service_login || item.login}</Text>
            </View>
          ) : null}

          {item.address?.logradouro || item.address?.bairro ? (
            <View style={styles.infoRowText}>
              <Text style={styles.infoLabel}>Endereço:</Text>
              <Text style={styles.infoValueSub} numberOfLines={1}>
                {item.address?.logradouro || ''} {item.address?.numero ? `, ${item.address.numero}` : ''} - {item.address?.bairro || ''}
              </Text>
            </View>
          ) : null}

          {/* SINAIS ÓPTICOS COLETADOS NA OLT */}
          <View style={styles.signalGrid}>
            <View style={styles.signalCol}>
              <Text style={styles.signalLabel}>RX Down (ONU)</Text>
              <Text style={[styles.signalValue, { color: getRxColor(item.info_rx) }]}>
                {item.info_rx ? `${item.info_rx} dBm` : '-'}
              </Text>
            </View>

            <View style={styles.signalCol}>
              <Text style={styles.signalLabel}>TX Up (ONU)</Text>
              <Text style={[styles.signalValue, { color: '#38BDF8' }]}>
                {item.info_tx ? `${item.info_tx} dBm` : '-'}
              </Text>
            </View>

            <View style={styles.signalCol}>
              <Text style={styles.signalLabel}>RX OLT</Text>
              <Text style={styles.signalValue}>
                {item.info_olt_rx ? `${item.info_olt_rx} dBm` : '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* BOTÕES DE AÇÃO: REINICIAR E DESAUTORIZAR */}
        <View style={styles.onuActionRow}>
          <TouchableOpacity
            style={[styles.onuActionBtn, styles.onuResetBtn]}
            onPress={() => confirmResetOnu(item)}
            disabled={actionLoadingOnuId === item.id}
            activeOpacity={0.8}
          >
            {actionLoadingOnuId === item.id && actionType === 'RESET' ? (
              <ActivityIndicator size="small" color="#F59E0B" style={{ marginRight: 6 }} />
            ) : (
              <Feather name="refresh-cw" size={13} color="#F59E0B" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.onuResetBtnText}>Reiniciar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.onuActionBtn, styles.onuDeauthBtn]}
            onPress={() => confirmDeauthOnu(item)}
            disabled={actionLoadingOnuId === item.id}
            activeOpacity={0.8}
          >
            {actionLoadingOnuId === item.id && actionType === 'DEAUTH' ? (
              <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 6 }} />
            ) : (
              <Feather name="user-x" size={13} color="#EF4444" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.onuDeauthBtnText}>Desautorizar</Text>
          </TouchableOpacity>
        </View>

        {/* BOTÃO DE DIAGNÓSTICO / LOG COMPLETO */}
        <TouchableOpacity
          style={styles.diagBtn}
          onPress={() => handleOpenOnuDiagModal(item)}
          activeOpacity={0.8}
        >
          <Feather name="activity" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
          <Text style={styles.diagBtnText}>Ver Diagnóstico Ao Vivo / Log OLT</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />

      {/* TOP HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBackToOs} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Consulta de ONU por OLT</Text>
          <Text style={styles.headerSubTitle}>
            {selectedOlt ? `OLT: ${selectedOlt.name} (${selectedOlt.olttype})` : 'Selecione uma OLT cadastrada'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (selectedOlt ? handleSelectOlt(selectedOlt) : loadOlts())}
          activeOpacity={0.7}
        >
          <Feather name="refresh-cw" size={18} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* SEÇÃO 1: LISTA DE OLTS (SE NENHUMA TIVER SELECIONADA) */}
      {!selectedOlt ? (
        <View style={{ flex: 1 }}>
          {isLoadingOlts ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Carregando OLTs cadastradas no SGP...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.sectionTitle}>OLTs Disponíveis no Provedor ({olts.length}):</Text>

              {olts.map((olt) => (
                <TouchableOpacity
                  key={olt.id}
                  style={styles.oltCard}
                  onPress={() => handleSelectOlt(olt)}
                  activeOpacity={0.85}
                >
                  <View style={styles.oltIconCircle}>
                    <Feather name="server" size={22} color="#38BDF8" />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.oltName}>{olt.name}</Text>
                    <Text style={styles.oltType}>
                      {olt.olttype} • Host: {olt.host}
                    </Text>

                    <View style={styles.oltMetaBadges}>
                      <View style={styles.oltPill}>
                        <Text style={styles.oltPillText}>{olt.pon_count} PONs</Text>
                      </View>
                      <View style={[styles.oltPill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Text style={[styles.oltPillText, { color: '#10B981' }]}>{olt.onu_count} ONUs</Text>
                      </View>
                    </View>
                  </View>

                  <Feather name="chevron-right" size={22} color="#64748B" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        /* SEÇÃO 2: ONUS DA OLT SELECIONADA */
        <View style={{ flex: 1 }}>
          {/* HEADER DA OLT SELECIONADA & BARRA DE VOLTAR */}
          <View style={styles.selectedOltBanner}>
            <TouchableOpacity style={styles.backToOltsBtn} onPress={() => setSelectedOlt(null)} activeOpacity={0.7}>
              <Feather name="arrow-left" size={14} color="#38BDF8" />
              <Text style={styles.backToOltsText}>Trocar OLT</Text>
            </TouchableOpacity>

            {/* BANNER COM ESTATÍSTICAS */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{stats.total}</Text>
                <Text style={styles.statLabel}>Total ONUs</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: '#10B981' }]}>{stats.onlineCount}</Text>
                <Text style={styles.statLabel}>Online ({stats.onlinePct}%)</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: '#EF4444' }]}>{stats.offlineCount}</Text>
                <Text style={styles.statLabel}>Offline</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: '#F59E0B' }]}>{stats.badSignalCount}</Text>
                <Text style={styles.statLabel}>Sinal &lt; -27</Text>
              </View>
            </View>
          </View>

          {/* BARRA DE PESQUISA */}
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar cliente, PPPoE, MAC/Serial, bairro ou PON..."
              placeholderTextColor="#64748B"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* FILTROS POR STATUS PILLS */}
          <View style={styles.pillsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
              <TouchableOpacity
                style={[styles.filterPill, statusFilter === 'TODAS' && styles.filterPillActive]}
                onPress={() => setStatusFilter('TODAS')}
              >
                <Text style={[styles.filterPillText, statusFilter === 'TODAS' && styles.filterPillTextActive]}>
                  Todas ({stats.total})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, statusFilter === 'ONLINE' && styles.filterPillActiveGreen]}
                onPress={() => setStatusFilter('ONLINE')}
              >
                <Text style={[styles.filterPillText, statusFilter === 'ONLINE' && styles.filterPillTextActive]}>
                  Online ({stats.onlineCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, statusFilter === 'OFFLINE' && styles.filterPillActiveRed]}
                onPress={() => setStatusFilter('OFFLINE')}
              >
                <Text style={[styles.filterPillText, statusFilter === 'OFFLINE' && styles.filterPillTextActive]}>
                  Offline ({stats.offlineCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, statusFilter === 'SINAL_FRACO' && styles.filterPillActiveAmber]}
                onPress={() => setStatusFilter('SINAL_FRACO')}
              >
                <Text style={[styles.filterPillText, statusFilter === 'SINAL_FRACO' && styles.filterPillTextActive]}>
                  Sinal Fraco ({stats.badSignalCount})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* FILTRO E QUANTIDADE DE ONUS POR PORTA PON */}
          {availablePons.length > 0 ? (
            <View style={styles.ponBar}>
              <Text style={styles.ponBarLabel}>Quantidade de ONUs por Porta PON:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                <TouchableOpacity
                  style={[styles.ponChip, selectedPon === 'TODAS' && styles.ponChipActive]}
                  onPress={() => setSelectedPon('TODAS')}
                >
                  <Text style={[styles.ponChipText, selectedPon === 'TODAS' && styles.ponChipTextActive]}>
                    Todas as PONs ({stats.total})
                  </Text>
                </TouchableOpacity>

                {availablePons.map((pNum) => {
                  const pStat = ponStats[pNum] || { total: 0, online: 0, offline: 0 };
                  const isSelected = selectedPon === pNum;
                  return (
                    <TouchableOpacity
                      key={pNum}
                      style={[styles.ponChip, isSelected && styles.ponChipActive]}
                      onPress={() => setSelectedPon(isSelected ? 'TODAS' : pNum)}
                    >
                      <Text style={[styles.ponChipText, isSelected && styles.ponChipTextActive]}>
                        PON {pNum}: <Text style={{ fontWeight: '800', color: isSelected ? '#38BDF8' : '#F8FAFC' }}>{pStat.total}</Text> ONUs ({pStat.online} on / {pStat.offline} off)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* LISTA DE ONUS */}
          {isLoadingOnus ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Carregando ONUs da {selectedOlt.name}...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredOnus}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderOnuItem}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              initialNumToRender={15}
              maxToRenderPerBatch={20}
              windowSize={10}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Feather name="search" size={40} color="#64748B" />
                  <Text style={styles.emptyTitle}>Nenhuma ONU Encontrada</Text>
                  <Text style={styles.emptySub}>Nenhum registro corresponde aos filtros selecionados.</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* MODAL DE DIAGNÓSTICO / LOG DA ONU */}
      <Modal visible={Boolean(selectedOnuForModal)} transparent animationType="slide" onRequestClose={() => setSelectedOnuForModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* MODAL HEADER */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedOnuForModal?.service_cliente || selectedOnuForModal?.description}</Text>
                <Text style={styles.modalSubTitle}>
                  Slot {selectedOnuForModal?.slot} • PON {selectedOnuForModal?.pon} • ONU #{selectedOnuForModal?.onuid} ({selectedOnuForModal?.phy_addr})
                </Text>
              </View>

              <TouchableOpacity onPress={() => setSelectedOnuForModal(null)} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {isLoadingModalDiag ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 13 }}>Consultando leituras ópticas e logs na OLT...</Text>
              </View>
            ) : (
              <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {/* SINAIS ÓPTICOS DA LEITURA AO VIVO */}
                <View style={styles.modalSignalGrid}>
                  <View style={styles.modalSignalCard}>
                    <Text style={styles.signalCardLabel}>Sinal RX (ONU)</Text>
                    <Text style={[styles.signalCardValue, { color: getRxColor(selectedOnuForModal?.info_rx) }]}>
                      {selectedOnuForModal?.info_rx ? `${selectedOnuForModal.info_rx} dBm` : '-'}
                    </Text>
                  </View>

                  <View style={styles.modalSignalCard}>
                    <Text style={styles.signalCardLabel}>Sinal TX (ONU)</Text>
                    <Text style={[styles.signalCardValue, { color: '#38BDF8' }]}>
                      {selectedOnuForModal?.info_tx ? `${selectedOnuForModal.info_tx} dBm` : '-'}
                    </Text>
                  </View>

                  <View style={styles.modalSignalCard}>
                    <Text style={styles.signalCardLabel}>RX na OLT</Text>
                    <Text style={styles.signalCardValue}>
                      {selectedOnuForModal?.info_olt_rx ? `${selectedOnuForModal.info_olt_rx} dBm` : '-'}
                    </Text>
                  </View>
                </View>

                {/* DETALHES DA ONU */}
                <View style={styles.modalDetailsBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status da ONU:</Text>
                    <Text style={[styles.detailValue, { color: selectedOnuForModal?.online ? '#10B981' : '#EF4444', fontWeight: 'bold' }]}>
                      {selectedOnuForModal?.online ? 'Online' : 'Offline (Desconectada)'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Modelo da ONU:</Text>
                    <Text style={styles.detailValue}>{selectedOnuForModal?.type || 'N/A'}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Serial / MAC:</Text>
                    <Text style={styles.detailValue}>{selectedOnuForModal?.phy_addr}</Text>
                  </View>

                  {selectedOnuForModal?.info_date ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Última Leitura de Sinal:</Text>
                      <Text style={styles.detailValue}>{selectedOnuForModal.info_date}</Text>
                    </View>
                  ) : null}
                </View>

                {/* BOTÕES DE AÇÃO NA MODAL: REINICIAR E DESAUTORIZAR */}
                {selectedOnuForModal ? (
                  <View style={styles.modalActionRow}>
                    <TouchableOpacity
                      style={[styles.modalActionBtn, styles.onuResetBtn, { flex: 1, marginRight: 6 }]}
                      onPress={() => confirmResetOnu(selectedOnuForModal)}
                      disabled={actionLoadingOnuId === selectedOnuForModal.id}
                      activeOpacity={0.8}
                    >
                      {actionLoadingOnuId === selectedOnuForModal.id && actionType === 'RESET' ? (
                        <ActivityIndicator size="small" color="#F59E0B" style={{ marginRight: 6 }} />
                      ) : (
                        <Feather name="refresh-cw" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                      )}
                      <Text style={styles.onuResetBtnText}>Reiniciar ONU</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalActionBtn, styles.onuDeauthBtn, { flex: 1, marginLeft: 6 }]}
                      onPress={() => confirmDeauthOnu(selectedOnuForModal)}
                      disabled={actionLoadingOnuId === selectedOnuForModal.id}
                      activeOpacity={0.8}
                    >
                      {actionLoadingOnuId === selectedOnuForModal.id && actionType === 'DEAUTH' ? (
                        <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 6 }} />
                      ) : (
                        <Feather name="user-x" size={14} color="#EF4444" style={{ marginRight: 6 }} />
                      )}
                      <Text style={styles.onuDeauthBtnText}>Desautorizar ONU</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* BOTÃO E SEÇÃO DE LOGS */}
                <TouchableOpacity
                  style={styles.onuLogToggleBtn}
                  onPress={() => setShowLogsSection(!showLogsSection)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="list" size={15} color="#38BDF8" style={{ marginRight: 8 }} />
                    <Text style={styles.onuLogToggleBtnText}>Histórico de Registros na OLT</Text>
                  </View>
                  <Feather name={showLogsSection ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
                </TouchableOpacity>

                {showLogsSection && (
                  <View style={styles.logsBoxContainer}>
                    {modalDiagData?.mappedLogs && modalDiagData.mappedLogs.length > 0 ? (
                      modalDiagData.mappedLogs.map((logItem: any, idx: number) => (
                        <View key={idx} style={styles.logCardItem}>
                          <View style={styles.logHeaderRow}>
                            <Text style={styles.logIndexText}>Registro #{idx + 1}</Text>
                            <Text style={[styles.logCauseText, { color: (logItem.causa || '').includes('Energia') ? '#F59E0B' : '#EF4444' }]}>
                              {logItem.causa || 'Desconexão'}
                            </Text>
                          </View>
                          {logItem.fim ? <Text style={styles.logDetailText}>Queda / Desconexão: {logItem.fim}</Text> : null}
                          {logItem.inicio ? <Text style={styles.logDetailText}>Reautenticação: {logItem.inicio}</Text> : null}
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', paddingVertical: 10 }}>
                        Nenhum registro recente de reautenticação encontrado na OLT.
                      </Text>
                    )}
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
  container: { flex: 1, backgroundColor: '#0D1117' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#161B22',
    borderBottomWidth: 1,
    borderBottomColor: '#21262D',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  headerSubTitle: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 8 },

  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#94A3B8', fontSize: 13, marginTop: 12 },

  sectionTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  oltCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  oltIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  oltName: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  oltType: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  oltMetaBadges: { flexDirection: 'row', marginTop: 8 },
  oltPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  oltPillText: { color: '#38BDF8', fontSize: 11, fontWeight: '600' },

  selectedOltBanner: {
    backgroundColor: '#161B22',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262D',
  },
  backToOltsBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backToOltsText: { color: '#38BDF8', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: '#0D1117', paddingVertical: 8, marginHorizontal: 2, borderRadius: 8 },
  statNum: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  statLabel: { color: '#94A3B8', fontSize: 10, marginTop: 2 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  searchInput: { flex: 1, color: '#F8FAFC', fontSize: 13 },

  pillsContainer: { marginTop: 10 },
  filterPill: {
    backgroundColor: '#161B22',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  filterPillActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  filterPillActiveGreen: { backgroundColor: '#10B981', borderColor: '#10B981' },
  filterPillActiveRed: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  filterPillActiveAmber: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  filterPillText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: '#0D1117', fontWeight: '700' },

  ponBar: { marginTop: 8 },
  ponBarLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginLeft: 16, marginBottom: 4 },
  ponChip: {
    backgroundColor: '#161B22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  ponChipActive: { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.15)' },
  ponChipText: { color: '#94A3B8', fontSize: 11 },
  ponChipTextActive: { color: '#38BDF8', fontWeight: '700' },

  onuCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  onuCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  clientName: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  contractSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  statusBadgeDot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  dotIndicator: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusBadgeDotText: { fontSize: 11, fontWeight: '700' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  metaBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1117', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  metaBadgeText: { color: '#38BDF8', fontSize: 11, fontWeight: '600' },
  macCopyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1117', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  macCopyText: { color: '#94A3B8', fontSize: 11, fontFamily: 'monospace' },

  infoBody: { borderTopWidth: 1, borderTopColor: '#21262D', paddingTop: 8 },
  infoRowText: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  infoLabel: { color: '#94A3B8', fontSize: 11, width: 80 },
  infoValue: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  infoValueSub: { color: '#CBD5E1', fontSize: 11, flex: 1 },

  signalGrid: { flexDirection: 'row', marginTop: 8, backgroundColor: '#0D1117', padding: 8, borderRadius: 8 },
  signalCol: { flex: 1, alignItems: 'center' },
  signalLabel: { color: '#94A3B8', fontSize: 10 },
  signalValue: { color: '#F8FAFC', fontSize: 13, fontWeight: '700', marginTop: 2 },

  diagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  diagBtnText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#161B22', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#21262D',
  },
  modalTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  modalSubTitle: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  closeBtn: { padding: 4 },

  modalSignalGrid: { flexDirection: 'row', marginBottom: 12 },
  modalSignalCard: { flex: 1, backgroundColor: '#0D1117', padding: 10, borderRadius: 8, marginHorizontal: 2, alignItems: 'center' },
  signalCardLabel: { color: '#94A3B8', fontSize: 10 },
  signalCardValue: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginTop: 4 },

  modalDetailsBox: { backgroundColor: '#0D1117', padding: 12, borderRadius: 10, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { color: '#94A3B8', fontSize: 12 },
  detailValue: { color: '#F8FAFC', fontSize: 12 },

  onuLogToggleBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0D1117',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#21262D',
  },
  onuLogToggleBtnText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },
  logsBoxContainer: { marginTop: 4, marginBottom: 20 },
  logCardItem: { backgroundColor: '#0D1117', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#21262D' },
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  logIndexText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  logCauseText: { fontSize: 11, fontWeight: '700' },
  logDetailText: { color: '#CBD5E1', fontSize: 11, marginTop: 2 },

  onuActionRow: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 8,
  },
  onuActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  onuResetBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    marginRight: 6,
  },
  onuResetBtnText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  onuDeauthBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    marginLeft: 6,
  },
  onuDeauthBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  modalActionRow: {
    flexDirection: 'row',
    marginBottom: 16,
    marginTop: 4,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
