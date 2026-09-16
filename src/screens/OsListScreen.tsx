import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { ChamadoItem } from '../types/sgp';
import {
  fetchOrdensDeServicoFromSgp,
} from '../services/sgpApi';
import { getLoggedTecnicoName } from '../services/webhookService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

interface Props {
  onOsClick: (chamado: ChamadoItem) => void;
  onOpenCreateOs?: () => void;
  onOpenClientSearch: () => void;
  onOpenOfflineClients: () => void;
  onOpenAuthorizeOnu?: () => void;
  onOpenOltConsultation?: () => void;
  onOpenFinancial?: () => void;
  onLogout: () => void;
}

/**
 * Converte datas em varios formatos (ISO ou BR) em timestamp numerico para ordenacao
 */
const parseSgpDateToTimestamp = (dateStr?: string): number => {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const str = dateStr.trim();
  if (!str) return 0;

  if (str.includes('-')) {
    const t = new Date(str).getTime();
    if (!isNaN(t)) return t;
  }

  if (str.includes('/')) {
    const parts = str.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const year = parseInt(dateParts[2], 10);
      let hour = 0, min = 0, sec = 0;
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        hour = parseInt(timeParts[0] || '0', 10);
        min = parseInt(timeParts[1] || '0', 10);
        sec = parseInt(timeParts[2] || '0', 10);
      }
      return new Date(year, month, day, hour, min, sec).getTime();
    }
  }

  return 0;
};

/**
 * Calcula a quantidade de dias de atraso de uma O.S. aberta ou em execução.
 * Retorna > 0 se estiver atrasada (com base na data de cadastro ou agendamento).
 */
const getOsOverdueDays = (item: ChamadoItem): number => {
  const rawOsStatus = item.os_status?.toString().trim();
  const rawOcStatus = item.oc_status?.toString().trim();
  const osDesc = (item.os_status_descricao || '').toLowerCase();
  const ocDesc = (item.oc_status_descricao || '').toLowerCase();
  const hasDataEnc = Boolean(item.oc_data_encerramento && item.oc_data_encerramento.trim().length > 0);
  const hasDataFin = Boolean(item.os_data_finalizacao && item.os_data_finalizacao.trim().length > 0);

  // Se já foi encerrada ou finalizada, não conta como atrasada
  if (
    rawOsStatus === '1' ||
    rawOcStatus === '1' ||
    osDesc.includes('encerrad') ||
    osDesc.includes('finalizad') ||
    ocDesc.includes('encerrad') ||
    ocDesc.includes('finalizad') ||
    hasDataEnc ||
    hasDataFin
  ) {
    return 0;
  }

  const dateRaw = item.os_data_agendamento || item.os_data_cadastro || item.oc_data_cadastro || '';
  const ts = parseSgpDateToTimestamp(dateRaw);
  if (!ts || ts <= 0) return 0;

  const diffMs = Date.now() - ts;
  if (diffMs <= 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const formatDateHeader = (
  dateRaw?: string
): { key: string; dayName: string; dayNum: string; monthStr: string; dayMonthStr: string } => {
  if (!dateRaw) {
    return { key: 'Sem Data', dayName: 'OUT', dayNum: '00', monthStr: 'Sem Data', dayMonthStr: 'Sem Data' };
  }

  const ts = parseSgpDateToTimestamp(dateRaw);
  if (!ts) {
    return { key: 'Outros', dayName: 'OUT', dayNum: '--', monthStr: 'Outros', dayMonthStr: 'Outros' };
  }

  const d = new Date(ts);
  const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
  const dayNum = String(d.getDate()).padStart(2, '0');
  const monthNum = String(d.getMonth() + 1).padStart(2, '0');
  const monthStr = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  const key = `${dayNum}/${monthNum}/${d.getFullYear()}`;
  const dayMonthStr = `${dayNum}/${monthNum}`;

  return { key, dayName, dayNum, monthStr, dayMonthStr };
};

export const OsListScreen: React.FC<Props> = ({
  onOsClick,
  onOpenCreateOs,
  onOpenClientSearch,
  onOpenOfflineClients,
  onOpenAuthorizeOnu,
  onOpenOltConsultation,
  onOpenFinancial,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<number>(0); // 0=Abertas, 1=Em Execução, 2=Finalizadas
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState('');
  const [chamados, setChamados] = useState<ChamadoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loggedTecnico, setLoggedTecnico] = useState<string>('Técnico');

  useEffect(() => {
    getLoggedTecnicoName().then((name) => {
      if (name) setLoggedTecnico(name);
    });
  }, []);

  const tabs = [
    { label: 'Abertas', code: 0, color: '#38BDF8' },
    { label: 'Em Execução', code: 1, color: '#F59E0B' },
    { label: 'Finalizadas', code: 2, color: '#10B981' },
  ];

  // Classifier strictly based on live SGP status_aberto / os_status
  const getItemStatus = (item: ChamadoItem): number => {
    const rawOsStatus = item.os_status?.toString().trim();
    const rawOcStatus = item.oc_status?.toString().trim();
    const osDesc = (item.os_status_descricao || '').toLowerCase();
    const ocDesc = (item.oc_status_descricao || '').toLowerCase();
    const hasDataEnc = Boolean(item.oc_data_encerramento && item.oc_data_encerramento.trim().length > 0);
    const hasDataFin = Boolean(item.os_data_finalizacao && item.os_data_finalizacao.trim().length > 0);

    // 2 = Encerrada / Finalizada
    if (
      rawOsStatus === '1' ||
      rawOcStatus === '1' ||
      osDesc.includes('encerrad') ||
      osDesc.includes('finalizad') ||
      ocDesc.includes('encerrad') ||
      ocDesc.includes('finalizad') ||
      hasDataEnc ||
      hasDataFin
    ) {
      return 2;
    }

    // 1 = Em Atendimento / Em Execução
    if (rawOsStatus === '2' || rawOcStatus === '2' || osDesc.includes('execuç')) {
      return 1;
    }

    // 0 = Aberta
    return 0;
  };

  const loadChamados = async () => {
    setIsLoading(true);
    try {
      const [activeOs, remoteFinalized] = await Promise.all([
        fetchOrdensDeServicoFromSgp(true, false),
        fetchOrdensDeServicoFromSgp(false, true),
      ]);

      const mapById = new Map<string, ChamadoItem>();
      activeOs.forEach((item: ChamadoItem) => mapById.set(String(item.os_id), item));
      remoteFinalized.forEach((item: ChamadoItem) => mapById.set(String(item.os_id), item));

      setChamados(Array.from(mapById.values()));
    } catch (e) {
      console.warn('Erro ao carregar Ordens de Serviço:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChamados();
  }, []);

  const countAbertas = useMemo(() => chamados.filter((x) => getItemStatus(x) === 0).length, [chamados]);
  const countExecucao = useMemo(() => chamados.filter((x) => getItemStatus(x) === 1).length, [chamados]);
  const countFinalizadas = useMemo(() => chamados.filter((x) => getItemStatus(x) === 2).length, [chamados]);

  // Extrai lista única de datas para o Carrossel Calendário (DA MAIS NOVA PARA A MAIS VELHA)
  const dateStrip = useMemo(() => {
    const datesMap: {
      [key: string]: { dayName: string; dayNum: string; monthStr: string; dayMonthStr: string; count: number; ts: number };
    } = {};

    chamados.forEach((item) => {
      const status = getItemStatus(item);
      const dateRaw = item.oc_data_encerramento || item.os_data_finalizacao || item.os_data_agendamento || item.oc_data_cadastro || '';

      if (selectedTab === 0 && status !== 0) return;
      if (selectedTab === 1 && status !== 1) return;
      if (selectedTab === 2 && status !== 2) return;

      const formatted = formatDateHeader(dateRaw);

      if (!datesMap[formatted.key]) {
        datesMap[formatted.key] = {
          dayName: formatted.dayName,
          dayNum: formatted.dayNum,
          monthStr: formatted.monthStr,
          dayMonthStr: formatted.dayMonthStr,
          count: 0,
          ts: parseSgpDateToTimestamp(dateRaw),
        };
      }
      datesMap[formatted.key].count += 1;
    });

    const sortedKeys = Object.keys(datesMap).sort((a, b) => datesMap[b].ts - datesMap[a].ts);

    return sortedKeys.map((k) => ({
      key: k,
      ...datesMap[k],
    }));
  }, [chamados, selectedTab]);

  // ORDENAÇÃO: O.S. ATRASADAS HÁ +3 DIAS DESTACADAS NO TOPO ABSOLUTO
  const filteredChamados = useMemo(() => {
    const list = chamados.filter((item) => {
      const status = getItemStatus(item);
      const dateEnc = item.oc_data_encerramento || item.os_data_finalizacao || item.os_data_agendamento || item.oc_data_cadastro || '';

      if (selectedTab === 0 && status !== 0) return false;
      if (selectedTab === 1 && status !== 1) return false;
      if (selectedTab === 2 && status !== 2) return false;

      // Filtro da Data Selecionada no Calendário
      if (selectedDateFilter !== 'TODAS') {
        const formatted = formatDateHeader(dateEnc);
        if (formatted.key !== selectedDateFilter) return false;
      }

      // Busca por Texto
      const query = searchQuery.trim().toLowerCase();
      if (query === '') return true;

      return (
        item.cliente?.toLowerCase().includes(query) ||
        item.oc_protocolo?.toLowerCase().includes(query) ||
        item.os_id?.toString().includes(query) ||
        item.os_conteudo?.toLowerCase().includes(query) ||
        item.oc_tipo_descricao?.toLowerCase().includes(query) ||
        item.servicos?.[0]?.servico_login?.toLowerCase().includes(query) ||
        item.endereco_bairro?.toLowerCase().includes(query)
      );
    });

    // Ordenação estrita:
    // 1º: O.S. ATRASADAS HÁ MAIS DE 3 DIAS NO TOPO ABSOLUTO (Em vermelho)
    // 2º: Demais O.S. da mais nova para a mais velha (dateB - dateA)
    return list.sort((a, b) => {
      const daysA = getOsOverdueDays(a);
      const daysB = getOsOverdueDays(b);

      const isOverdueA = daysA >= 3;
      const isOverdueB = daysB >= 3;

      if (isOverdueA && !isOverdueB) return -1;
      if (!isOverdueA && isOverdueB) return 1;

      if (isOverdueA && isOverdueB) {
        return daysB - daysA;
      }

      const dateA = parseSgpDateToTimestamp(a.oc_data_encerramento || a.os_data_finalizacao || a.os_data_agendamento || a.oc_data_cadastro);
      const dateB = parseSgpDateToTimestamp(b.oc_data_encerramento || b.os_data_finalizacao || b.os_data_agendamento || b.oc_data_cadastro);
      return dateB - dateA;
    });
  }, [chamados, selectedTab, selectedDateFilter, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#070A11" />

      {/* TOP HEADER MODERNO */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <TouchableOpacity
            onPress={() => setIsMenuOpen(true)}
            style={styles.hamburgerBtn}
            activeOpacity={0.7}
          >
            <Feather name="menu" size={20} color="#F8FAFC" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Agenda de Serviços</Text>
            <Text style={styles.headerSubtitle}>
              Vega Sync • {filteredChamados.length} chamados
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={loadChamados} style={styles.refreshBtn} activeOpacity={0.7}>
            <Feather name="refresh-cw" size={16} color="#38BDF8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* SEARCH INPUT BAR MODERNA */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar cliente, O.S., login ou bairro..."
            placeholderTextColor="#475569"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* KPI SEGMENTED STATUS TABS */}
      <View style={styles.kpiTabsContainer}>
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.code;
          let count = 0;
          if (tab.code === 0) count = countAbertas;
          if (tab.code === 1) count = countExecucao;
          if (tab.code === 2) count = countFinalizadas;

          return (
            <TouchableOpacity
              key={tab.code}
              style={[
                styles.kpiTabItem,
                isSelected && styles.kpiTabItemActive,
              ]}
              onPress={() => {
                setSelectedTab(tab.code);
                setSelectedDateFilter('TODAS');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.kpiTabTopRow}>
                <View style={[styles.kpiStatusDot, { backgroundColor: tab.color }]} />
                <Text
                  style={[
                    styles.kpiTabLabel,
                    isSelected && { color: '#F8FAFC', fontWeight: '800' },
                  ]}
                >
                  {tab.label}
                </Text>
              </View>

              <View
                style={[
                  styles.kpiCountBadge,
                  isSelected && { backgroundColor: tab.color },
                ]}
              >
                <Text
                  style={[
                    styles.kpiCountBadgeText,
                    isSelected && { color: '#070A11' },
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* SWIPEABLE CALENDAR DAY STRIP */}
      <View style={styles.calendarStripContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendarStripContent}
        >
          {/* Botão Ver Todas as Datas */}
          <TouchableOpacity
            style={[
              styles.dayCard,
              selectedDateFilter === 'TODAS' && styles.dayCardActive,
            ]}
            onPress={() => setSelectedDateFilter('TODAS')}
            activeOpacity={0.8}
          >
            <Feather
              name="calendar"
              size={13}
              color={selectedDateFilter === 'TODAS' ? '#070A11' : '#38BDF8'}
              style={{ marginBottom: 2 }}
            />
            <Text
              style={[
                styles.dayNameText,
                selectedDateFilter === 'TODAS' && styles.dayTextActive,
              ]}
            >
              TODAS
            </Text>
          </TouchableOpacity>

          {/* Cards de Dias Individuais */}
          {dateStrip.map((item) => {
            const isSelected = selectedDateFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.dayCard, isSelected && styles.dayCardActive]}
                onPress={() => setSelectedDateFilter(item.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dayNameText, isSelected && styles.dayTextActive]}>
                  {item.dayName}
                </Text>
                <Text style={[styles.dayNumText, isSelected && styles.dayTextActive]}>
                  {item.dayNum}
                </Text>
                <View
                  style={[
                    styles.dayBadgeCount,
                    isSelected && { backgroundColor: '#070A11' },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayBadgeCountText,
                      isSelected && { color: '#38BDF8' },
                    ]}
                  >
                    {item.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* MAIN LIST AREA */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Sincronizando agenda do técnico...</Text>
        </View>
      ) : filteredChamados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="check-circle" size={36} color="#38BDF8" />
          </View>
          <Text style={styles.emptyTitle}>Nenhuma O.S. no Momento</Text>
          <Text style={styles.emptySub}>
            Não há chamados pendentes para o filtro ou data selecionada.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChamados}
          keyExtractor={(item) => item.os_id.toString()}
          renderItem={({ item }) => (
            <ModernTimelineOsCard
              chamado={item}
              onPress={() => onOsClick(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* MODAL MENU HAMBÚRGUER (DRAWER LATERAL ESQUERDO) */}
      <Modal
        visible={isMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <View
            style={[
              styles.drawerContent,
              {
                paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 20) + 16,
                paddingBottom: Math.max(insets.bottom, 12) + 6,
              },
            ]}
          >
            {/* DRAWER TOP HEADER */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrandRow}>
                <Image
                  source={require('../../assets/logo-symbol-white.png')}
                  style={styles.drawerLogoSymbol}
                />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.drawerTitle}>Vega Sync</Text>
                  <Text style={styles.drawerSubtitle}>Gestão de Campo</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeDrawerBtn}
                onPress={() => setIsMenuOpen(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* TECHNICIAN PROFILE CARD */}
            <View style={styles.drawerProfileCard}>
              <View style={styles.drawerAvatarCircle}>
                <Feather name="user" size={16} color="#818CF8" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.drawerProfileName} numberOfLines={1}>
                  {loggedTecnico || 'Técnico de Campo'}
                </Text>
                <View style={styles.drawerStatusRow}>
                  <View style={styles.drawerStatusDot} />
                  <Text style={styles.drawerStatusText}>Online • Em Campo</Text>
                </View>
              </View>
            </View>

            {/* DRAWER SCROLLABLE MENU ITEMS */}
            <ScrollView
              style={styles.drawerScrollView}
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* SECTION: OPERACIONAL */}
              <Text style={styles.drawerSectionLabel}>OPERACIONAL</Text>

              {/* ITEM 1: CRIAR O.S. (DESTAQUE) */}
              <TouchableOpacity
                style={[styles.menuItemRow, styles.menuItemRowHighlight]}
                onPress={() => {
                  setIsMenuOpen(false);
                  if (onOpenCreateOs) onOpenCreateOs();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                  <Feather name="plus-circle" size={18} color="#818CF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: '#818CF8', fontWeight: '700' }]}>
                    Abrir Nova OS
                  </Text>
                  <Text style={styles.menuItemSubText}>Abertura rápida de chamado</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#818CF8" />
              </TouchableOpacity>

              {/* ITEM 2: ORDENS DE SERVIÇO */}
              <TouchableOpacity
                style={[styles.menuItemRow, styles.menuItemRowActive]}
                onPress={() => setIsMenuOpen(false)}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                  <Feather name="calendar" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Ordens de Serviço</Text>
                  <Text style={styles.menuItemSubText}>Agenda de chamados</Text>
                </View>
                <View style={styles.drawerCountBadge}>
                  <Text style={styles.drawerCountBadgeText}>{chamados.length}</Text>
                </View>
              </TouchableOpacity>

              {/* ITEM 3: BUSCAR CLIENTES */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  onOpenClientSearch();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
                  <Feather name="search" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Buscar Clientes</Text>
                  <Text style={styles.menuItemSubText}>Consulta por nome/CPF</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#475569" />
              </TouchableOpacity>

              {/* ITEM 4: CLIENTES OFFLINE */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  onOpenOfflineClients();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Feather name="wifi-off" size={18} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Clientes Offline</Text>
                  <Text style={styles.menuItemSubText}>Mapa e lista por bairro</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#475569" />
              </TouchableOpacity>

              {/* SECTION: REDE & FIBRA */}
              <Text style={styles.drawerSectionLabel}>REDE & FIBRA GPON</Text>

              {/* ITEM 5: AUTORIZAR ONU */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  if (onOpenAuthorizeOnu) onOpenAuthorizeOnu();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Feather name="cpu" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Autorizar ONU</Text>
                  <Text style={styles.menuItemSubText}>Provisionamento na OLT</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#475569" />
              </TouchableOpacity>

              {/* ITEM 6: CONSULTA DE ONU / OLT */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  if (onOpenOltConsultation) onOpenOltConsultation();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                  <Feather name="server" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Consulta de ONU</Text>
                  <Text style={styles.menuItemSubText}>Listar OLTs e portas PON</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#475569" />
              </TouchableOpacity>

              {/* SECTION: GESTÃO */}
              <Text style={styles.drawerSectionLabel}>GESTÃO & DESPESAS</Text>

              {/* ITEM 7: FINANCEIRO */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  if (onOpenFinancial) onOpenFinancial();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Feather name="dollar-sign" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Financeiro</Text>
                  <Text style={styles.menuItemSubText}>Despesas e abastecimento</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#475569" />
              </TouchableOpacity>
            </ScrollView>

            {/* DRAWER FOOTER (LOGOUT & VERSION) */}
            <View style={styles.drawerFooter}>
              <TouchableOpacity
                style={styles.logoutMenuItemBtn}
                onPress={() => {
                  setIsMenuOpen(false);
                  onLogout();
                }}
                activeOpacity={0.8}
              >
                <Feather name="log-out" size={16} color="#EF4444" />
                <Text style={styles.logoutMenuItemText}>Sair da Conta</Text>
              </TouchableOpacity>
              <Text style={styles.drawerVersionText}>Vega Sync • v2.0</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.drawerBackdrop}
            onPress={() => setIsMenuOpen(false)}
            activeOpacity={1}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

interface CardProps {
  chamado: ChamadoItem;
  onPress: () => void;
}

const ModernTimelineOsCard: React.FC<CardProps> = ({ chamado, onPress }) => {
  const servico = chamado.servicos?.[0];

  const rawOsStatus = chamado.os_status?.toString().trim();
  const rawOcStatus = chamado.oc_status?.toString().trim();
  const osDesc = (chamado.os_status_descricao || '').toLowerCase();
  const ocDesc = (chamado.oc_status_descricao || '').toLowerCase();
  const hasDataEnc = Boolean(chamado.oc_data_encerramento && chamado.oc_data_encerramento.trim().length > 0);
  const hasDataFin = Boolean(chamado.os_data_finalizacao && chamado.os_data_finalizacao.trim().length > 0);

  const isEncerrada =
    rawOsStatus === '1' ||
    rawOcStatus === '1' ||
    osDesc.includes('encerrad') ||
    osDesc.includes('finalizad') ||
    ocDesc.includes('encerrad') ||
    ocDesc.includes('finalizad') ||
    hasDataEnc ||
    hasDataFin;

  const isEmAtendimento = !isEncerrada && (rawOsStatus === '2' || rawOcStatus === '2' || osDesc.includes('execuç'));

  const overdueDays = getOsOverdueDays(chamado);
  const isAtrasada3Dias = overdueDays >= 3;

  const getStatusColor = () => {
    if (isAtrasada3Dias) return '#EF4444'; // Red
    if (isEncerrada) return '#10B981'; // Green
    if (isEmAtendimento) return '#F59E0B'; // Amber
    return '#38BDF8'; // Cyan
  };

  const getStatusLabel = () => {
    if (isAtrasada3Dias) return `ATRASADA (${overdueDays}d)`;
    if (isEncerrada) return 'Finalizada';
    if (isEmAtendimento) return 'Em Execução';
    return 'Aberta';
  };

  // Horário Formatado da O.S.
  const dateRaw = chamado.oc_data_encerramento || chamado.os_data_finalizacao || chamado.os_data_agendamento || chamado.oc_data_cadastro || '';
  let timeStr = '--:--';
  if (dateRaw.includes('T')) {
    const tPart = dateRaw.split('T')[1];
    if (tPart) timeStr = tPart.substring(0, 5);
  } else if (dateRaw.includes(' ')) {
    const parts = dateRaw.split(' ');
    if (parts[1]) timeStr = parts[1].substring(0, 5);
  }

  const pppoeLogin = servico?.servico_login || '';
  const bairro = chamado.endereco_bairro || 'Bairro n/i';
  const ctoPorta = chamado.contrato_pop || 'CTO n/i';

  return (
    <TouchableOpacity
      style={[
        styles.cardContainer,
        isAtrasada3Dias && styles.cardContainerAtrasada,
      ]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {/* LATERAL DE STATUS */}
      <View style={[styles.timelineBar, { backgroundColor: getStatusColor() }]} />

      <View style={styles.cardBody}>
        {/* BANNER DE ALERTA DE ATRASO > 3 DIAS */}
        {isAtrasada3Dias && (
          <View style={styles.atrasadaCardHeaderBadge}>
            <Feather name="alert-triangle" size={12} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.atrasadaCardHeaderBadgeText}>
              ATRASADA HÁ {overdueDays} DIAS
            </Text>
          </View>
        )}

        {/* TOP ROW: PROTOCOLO / ID & TIME BADGE */}
        <View style={styles.cardTopRow}>
          <View style={styles.protocolBadge}>
            <Text style={styles.protocolHash}>#</Text>
            <Text style={styles.protocolText}>
              {chamado.os_id}
            </Text>
            {chamado.oc_protocolo ? (
              <Text style={styles.protocolSubText}> • {chamado.oc_protocolo}</Text>
            ) : null}
          </View>

          <View style={styles.topRightRow}>
            <View style={styles.timeBadge}>
              <Feather name="clock" size={11} color="#94A3B8" style={{ marginRight: 4 }} />
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>

            <View style={[styles.statusBadgeDot, { backgroundColor: `${getStatusColor()}15`, borderColor: `${getStatusColor()}40` }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
              <Text style={[styles.statusDotText, { color: getStatusColor() }]}>
                {getStatusLabel()}
              </Text>
            </View>
          </View>
        </View>

        {/* NOME DO CLIENTE */}
        <Text style={styles.clientNameText} numberOfLines={1}>
          {chamado.cliente || 'Cliente SGP'}
        </Text>

        {/* ASSUNTO / PROBLEMA */}
        {chamado.oc_tipo_descricao || chamado.os_conteudo ? (
          <View style={styles.problemBox}>
            {chamado.oc_tipo_descricao ? (
              <Text style={styles.problemTag}>[{chamado.oc_tipo_descricao}] </Text>
            ) : null}
            <Text style={styles.problemText} numberOfLines={2}>
              {chamado.os_conteudo || chamado.os_observacao || 'Sem descrição detalhada'}
            </Text>
          </View>
        ) : null}

        {/* META DETAILS CHIPS (LOGIN, BAIRRO, CTO) */}
        <View style={styles.metaGrid}>
          {pppoeLogin ? (
            <View style={styles.metaChip}>
              <Feather name="user" size={11} color="#38BDF8" />
              <Text style={styles.metaChipText} numberOfLines={1}>
                {pppoeLogin}
              </Text>
            </View>
          ) : null}

          <View style={styles.metaChip}>
            <Feather name="map-pin" size={11} color="#94A3B8" />
            <Text style={styles.metaChipText} numberOfLines={1}>
              {bairro}
            </Text>
          </View>

          <View style={styles.metaChip}>
            <Feather name="box" size={11} color="#F59E0B" />
            <Text style={styles.metaChipText} numberOfLines={1}>
              {ctoPorta}
            </Text>
          </View>
        </View>

        {/* FOOTER ACTION ROW */}
        <View style={styles.cardFooter}>
          <Text style={styles.actionPromptText}>Ver detalhes & Atendimento</Text>
          <View style={styles.actionArrowCircle}>
            <Feather name="arrow-right" size={13} color="#38BDF8" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A11',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#070A11',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hamburgerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },

  // SEARCH BAR
  searchWrapper: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '500',
  },

  // KPI STATUS TABS
  kpiTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  kpiTabItem: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  kpiTabItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  kpiTabTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  kpiTabLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  kpiCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kpiCountBadgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },

  // CALENDAR STRIP
  calendarStripContainer: {
    marginBottom: 10,
  },
  calendarStripContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayCard: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    position: 'relative',
  },
  dayCardActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  dayNameText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  dayNumText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#F8FAFC',
    marginTop: 1,
  },
  dayTextActive: {
    color: '#070A11',
  },
  dayBadgeCount: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dayBadgeCountText: {
    color: '#38BDF8',
    fontSize: 8,
    fontWeight: '800',
  },

  // EMPTY & LOADING
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  // LIST CONTENT
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },

  // O.S. CARD MODERNO
  cardContainer: {
    flexDirection: 'row',
    backgroundColor: '#0D1424',
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  cardContainerAtrasada: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  timelineBar: {
    width: 4.5,
  },
  cardBody: {
    flex: 1,
    padding: 14,
  },
  atrasadaCardHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  atrasadaCardHeaderBadgeText: {
    color: '#EF4444',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  protocolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protocolHash: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
    marginRight: 2,
  },
  protocolText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  protocolSubText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  statusBadgeDot: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  statusDotText: {
    fontSize: 10,
    fontWeight: '800',
  },
  clientNameText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  problemBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  problemTag: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  problemText: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#070A11',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    maxWidth: '48%',
  },
  metaChipText: {
    color: '#CBD5E1',
    fontSize: 11,
    marginLeft: 5,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionPromptText: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  actionArrowCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // DRAWER MENU
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
  },
  drawerContent: {
    width: 295,
    backgroundColor: '#080C14',
    height: '100%',
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    justifyContent: 'space-between',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerLogoSymbol: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  drawerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  drawerSubtitle: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  closeDrawerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  drawerAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerProfileName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  drawerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  drawerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  drawerStatusText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  drawerScrollView: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingBottom: 16,
  },
  drawerSectionLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  menuItemRowActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  menuItemRowHighlight: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  menuItemIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  menuItemText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  menuItemSubText: {
    color: '#64748B',
    fontSize: 10.5,
    marginTop: 1.5,
  },
  drawerCountBadge: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  drawerCountBadgeText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
  },
  drawerFooter: {
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    alignItems: 'center',
  },
  logoutMenuItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginBottom: 8,
  },
  logoutMenuItemText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  drawerVersionText: {
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '500',
  },
});
