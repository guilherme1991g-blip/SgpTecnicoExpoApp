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
} from 'react-native';
import { ChamadoItem } from '../types/sgp';
import {
  fetchOrdensDeServicoFromSgp,
  getFinalizedChamadosLocal,
} from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onOsClick: (chamado: ChamadoItem) => void;
  onOpenClientSearch: () => void;
  onOpenOfflineClients: () => void;
  onOpenAuthorizeOnu?: () => void;
  onOpenOltConsultation?: () => void;
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
 * Verifica se a data fornecida está dentro dos últimos 7 dias a partir de hoje
 */
const isWithinLast7Days = (dateStr?: string): boolean => {
  if (!dateStr || typeof dateStr !== 'string') return true;
  const ts = parseSgpDateToTimestamp(dateStr);
  if (!ts) return true;

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const diff = now - ts;
  
  // Aceita qualquer data nos últimos 7 dias (permitindo margem para fuso horário de hoje)
  return diff <= sevenDaysMs && diff >= -(24 * 60 * 60 * 1000);
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
  onOpenClientSearch,
  onOpenOfflineClients,
  onOpenAuthorizeOnu,
  onOpenOltConsultation,
  onLogout,
}) => {
  const [selectedTab, setSelectedTab] = useState<number>(0); // 0=Abertas, 1=Em Execução, 2=Finalizadas (7d)
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState('');
  const [chamados, setChamados] = useState<ChamadoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleTabChange = (code: number) => {
    setSelectedTab(code);
    setSelectedDateFilter('TODAS');
  };

  const tabs = [
    { label: 'Abertas', code: 0 },
    { label: 'Em Execução', code: 1 },
    { label: 'Finalizadas', code: 2 },
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
      const [activeOs, remoteFinalized, localFinalized] = await Promise.all([
        fetchOrdensDeServicoFromSgp(true, false),
        fetchOrdensDeServicoFromSgp(false, true),
        getFinalizedChamadosLocal(),
      ]);

      const mapById = new Map<string, ChamadoItem>();
      activeOs.forEach((item) => mapById.set(String(item.os_id), item));
      remoteFinalized.forEach((item) => mapById.set(String(item.os_id), item));
      localFinalized.forEach((item) => mapById.set(String(item.os_id), item));

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

  // Quantidade de O.S. Atrasadas há mais de 3 dias
  const countAtrasadas3Dias = useMemo(() => {
    return chamados.filter((x) => getOsOverdueDays(x) >= 3).length;
  }, [chamados]);

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
        // Entre as atrasadas, a com mais dias de atraso fica em primeiro no topo
        return daysB - daysA;
      }

      const dateA = parseSgpDateToTimestamp(a.oc_data_encerramento || a.os_data_finalizacao || a.os_data_agendamento || a.oc_data_cadastro);
      const dateB = parseSgpDateToTimestamp(b.oc_data_encerramento || b.os_data_finalizacao || b.os_data_agendamento || b.oc_data_cadastro);
      return dateB - dateA;
    });
  }, [chamados, selectedTab, selectedDateFilter, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />

      {/* Top Header Original */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <TouchableOpacity
            onPress={() => setIsMenuOpen(true)}
            style={styles.hamburgerBtn}
            activeOpacity={0.7}
          >
            <Feather name="menu" size={22} color="#F8FAFC" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Agenda SGP Técnico</Text>
            <Text style={styles.headerSubtitle}>
              {filteredChamados.length} O.S. (Mais novas primeiro)
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={loadChamados} style={styles.iconBtn} activeOpacity={0.7}>
            <Feather name="refresh-cw" size={18} color="#38BDF8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar Original */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar cliente, O.S., problema ou bairro..."
          placeholderTextColor="#64748B"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* BANNER DE ALERTA DE O.S. ATRASADAS HÁ MAIS DE 3 DIAS NO TOPO DA TELA */}
      {countAtrasadas3Dias > 0 && selectedTab !== 2 ? (
        <View style={styles.atrasadaTopAlertBanner}>
          <Feather name="alert-triangle" size={16} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.atrasadaTopAlertText}>
            <Text style={{ fontWeight: '800', color: '#EF4444' }}>{countAtrasadas3Dias} O.S. Atrasada{countAtrasadas3Dias > 1 ? 's' : ''} (+3 dias)</Text> destacada{countAtrasadas3Dias > 1 ? 's' : ''} no topo em vermelho!
          </Text>
        </View>
      ) : null}

      {/* Modern Status Filter Pills (Com ScrollView para caber perfeitamente) */}
      <View style={styles.pillsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScrollContent}
        >
          {tabs.map((tab) => {
            const isSelected = selectedTab === tab.code;
            let count = 0;
            if (tab.code === 0) count = countAbertas;
            if (tab.code === 1) count = countExecucao;
            if (tab.code === 2) count = countFinalizadas;

            return (
              <TouchableOpacity
                key={tab.code}
                style={[styles.statusPill, isSelected && styles.statusPillActive]}
                onPress={() => {
                  setSelectedTab(tab.code);
                  setSelectedDateFilter('TODAS');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.statusPillText, isSelected && styles.statusPillTextActive]}>
                  {tab.label}
                </Text>
                <View style={[styles.pillBadge, isSelected && styles.pillBadgeActive]}>
                  <Text style={[styles.pillBadgeText, isSelected && styles.pillBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
            <Text
              style={[
                styles.dayNameText,
                selectedDateFilter === 'TODAS' && styles.dayTextActive,
              ]}
            >
              VER
            </Text>
            <Text
              style={[
                styles.dayNumText,
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
                <View style={styles.dayBadgeCount}>
                  <Text style={styles.dayBadgeCountText}>{item.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List Area */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Carregando agenda do técnico...</Text>
        </View>
      ) : filteredChamados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="check-circle" size={48} color="#64748B" />
          <Text style={styles.emptyTitle}>Nenhuma O.S. Encontrada</Text>
          <Text style={styles.emptySub}>
            Não há registros cadastrados no momento para este filtro.
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
          <View style={styles.drawerContent}>
            {/* DRAWER HEADER */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerHeaderIcon}>
                <Feather name="shield" size={24} color="#38BDF8" />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.drawerTitle}>SGP Técnico</Text>
                <Text style={styles.drawerSubtitle}>Menu de Operações</Text>
              </View>

              <TouchableOpacity
                style={styles.closeDrawerBtn}
                onPress={() => setIsMenuOpen(false)}
              >
                <Feather name="x" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* DRAWER MENU ITEMS */}
            <View style={styles.drawerMenuItems}>
              {/* ORDENS DE SERVIÇO */}
              <TouchableOpacity
                style={[styles.menuItemRow, styles.menuItemRowActive]}
                onPress={() => setIsMenuOpen(false)}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemIconCircle}>
                  <Feather name="file-text" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Ordens de Serviço</Text>
                  <Text style={styles.menuItemSubText}>Agenda de chamados em aberto</Text>
                </View>
              </TouchableOpacity>

              {/* BUSCAR CLIENTES */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  onOpenClientSearch();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemIconCircle}>
                  <Feather name="search" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Buscar Clientes</Text>
                  <Text style={styles.menuItemSubText}>Consulta por nome no SGP</Text>
                </View>
              </TouchableOpacity>

              {/* CLIENTES OFFLINE */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  onOpenOfflineClients();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemIconCircle}>
                  <Feather name="wifi-off" size={18} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Clientes Offline</Text>
                  <Text style={styles.menuItemSubText}>Filtro por bairro, Ativo vs Suspenso</Text>
                </View>
              </TouchableOpacity>

              {/* AUTORIZAR ONU */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  if (onOpenAuthorizeOnu) {
                    onOpenAuthorizeOnu();
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemIconCircle}>
                  <Feather name="cpu" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Autorizar ONU</Text>
                  <Text style={styles.menuItemSubText}>Provisionamento direto na OLT</Text>
                </View>
              </TouchableOpacity>

              {/* CONSULTA DE ONU POR OLT */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  if (onOpenOltConsultation) {
                    onOpenOltConsultation();
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemIconCircle}>
                  <Feather name="server" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Consulta de ONU</Text>
                  <Text style={styles.menuItemSubText}>Listar OLTs e ONUs por OLT</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* DRAWER FOOTER (LOGOUT) */}
            <View style={styles.drawerFooter}>
              <TouchableOpacity
                style={styles.logoutMenuItemBtn}
                onPress={() => {
                  setIsMenuOpen(false);
                  onLogout();
                }}
                activeOpacity={0.8}
              >
                <Feather name="log-out" size={18} color="#EF4444" />
                <Text style={styles.logoutMenuItemText}>Sair da Conta</Text>
              </TouchableOpacity>
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
    if (isAtrasada3Dias) return '#EF4444'; // Vermelho absoluto para O.S. atrasada +3 dias
    if (isEncerrada) return '#10B981'; // Green (Encerrada)
    if (isEmAtendimento) return '#F59E0B'; // Amber (Em Execução)
    return '#38BDF8'; // Cyan/Blue (Aberta)
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
  const bairro = chamado.endereco_bairro || 'Não informado';
  const ctoPorta = chamado.contrato_pop || 'CTO Não Vinculada';

  return (
    <TouchableOpacity
      style={[
        styles.cardContainer,
        isAtrasada3Dias && {
          borderColor: '#EF4444',
          borderWidth: 1.5,
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* TIMELINE INDICATOR LEFT BAR */}
      <View style={[styles.timelineBar, { backgroundColor: getStatusColor() }]} />

      <View style={styles.cardBody}>
        {/* BANNER DE ALERTA DE ATRASO > 3 DIAS NO TOPO DO CARTÃO */}
        {isAtrasada3Dias ? (
          <View style={styles.atrasadaCardHeaderBadge}>
            <Feather name="alert-triangle" size={13} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.atrasadaCardHeaderBadgeText}>
              ⚠️ O.S. ATRASADA HÁ {overdueDays} DIAS
            </Text>
          </View>
        ) : null}

        {/* TOP ROW: PROTOCOLO / ID & TIME BADGE */}
        <View style={styles.cardTopRow}>
          <View style={styles.protocolBadge}>
            <Feather name="hash" size={12} color="#38BDF8" />
            <Text style={styles.protocolText}>
              O.S. #{chamado.os_id} {chamado.oc_protocolo ? `• ${chamado.oc_protocolo}` : ''}
            </Text>
          </View>

          <View style={styles.timeBadge}>
            <Feather name="clock" size={11} color="#94A3B8" style={{ marginRight: 4 }} />
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>
        </View>

        {/* CLIENT NAME & STATUS PILL */}
        <View style={styles.clientRow}>
          <Text style={styles.clientNameText} numberOfLines={1}>
            {chamado.cliente || 'Cliente SGP'}
          </Text>
          <View style={[styles.statusBadgeDot, { backgroundColor: `${getStatusColor()}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusDotText, { color: getStatusColor() }]}>
              {getStatusLabel()}
            </Text>
          </View>
        </View>

        {/* ASSUNTO / PROBLEMA */}
        {chamado.oc_tipo_descricao || chamado.os_conteudo ? (
          <Text style={styles.problemText} numberOfLines={2}>
            {chamado.oc_tipo_descricao ? `[${chamado.oc_tipo_descricao}] ` : ''}
            {chamado.os_conteudo || chamado.os_observacao || 'Sem descrição detalhada'}
          </Text>
        ) : null}

        {/* META DETAILS CHIPS (BAIRRO, CTO, PPPOE) */}
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
          <Feather name="arrow-right" size={14} color="#38BDF8" />
        </View>
      </View>
    </TouchableOpacity>
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
    justifyContent: 'space-between',
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
  hamburgerBtn: {
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#161F30',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
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
    height: 44,
    color: '#F8FAFC',
    fontSize: 13,
  },
  pillsContainer: {
    marginBottom: 10,
  },
  pillsScrollContent: {
    paddingHorizontal: 16,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statusPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  statusPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  pillBadge: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  pillBadgeActive: {
    backgroundColor: '#38BDF8',
  },
  pillBadgeText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: 'bold',
  },
  pillBadgeTextActive: {
    color: '#0F172A',
  },
  calendarStripContainer: {
    marginBottom: 10,
  },
  calendarStripContent: {
    paddingHorizontal: 16,
  },
  dayCard: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#161F30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  dayCardActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  dayNameText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  dayNumText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 2,
  },
  dayTextActive: {
    color: '#0F172A',
  },
  dayBadgeCount: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dayBadgeCountText: {
    color: '#F8FAFC',
    fontSize: 8,
    fontWeight: 'bold',
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
    marginTop: 14,
    marginBottom: 6,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  cardContainer: {
    flexDirection: 'row',
    backgroundColor: '#111726',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  timelineBar: {
    width: 5,
  },
  cardBody: {
    flex: 1,
    padding: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  protocolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protocolText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  clientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  clientNameText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  statusBadgeDot: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusDotText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  problemText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
    maxWidth: '48%',
  },
  metaChipText: {
    color: '#94A3B8',
    fontSize: 11,
    marginLeft: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  actionPromptText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
  },
  drawerContent: {
    width: 285,
    backgroundColor: '#0B0F17',
    height: '100%',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 14 : 44,
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    justifyContent: 'space-between',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    marginBottom: 16,
  },
  drawerHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  drawerSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  closeDrawerBtn: {
    padding: 4,
  },
  drawerMenuItems: {
    flex: 1,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  menuItemRowActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: '#38BDF8',
  },
  menuItemIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemSubText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  drawerFooter: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    marginBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  logoutMenuItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutMenuItemText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 8,
  },
  atrasadaTopAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  atrasadaTopAlertText: {
    color: '#F8FAFC',
    fontSize: 12,
    flex: 1,
  },
  atrasadaCardHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  atrasadaCardHeaderBadgeText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
