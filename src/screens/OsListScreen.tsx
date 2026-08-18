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
} from 'react-native';
import { ChamadoItem } from '../types/sgp';
import { fetchOrdensDeServicoFromSgp } from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onOsClick: (chamado: ChamadoItem) => void;
  onOpenClientSearch: () => void;
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

export const OsListScreen: React.FC<Props> = ({ onOsClick, onOpenClientSearch, onLogout }) => {
  const [selectedTab, setSelectedTab] = useState<number>(0); // 0=Abertas (Todas), 1=Em Execução
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('TODAS'); // 'TODAS' ou data 'DD/MM/YYYY'
  const [searchQuery, setSearchQuery] = useState('');
  const [chamados, setChamados] = useState<ChamadoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const tabs = [
    { label: 'Abertas', code: 0 },
    { label: 'Em Execução', code: 1 },
  ];

  // Classifier strictly based on live SGP status_aberto / os_status
  const getItemStatus = (item: ChamadoItem): number => {
    const rawOsStatus = item.os_status?.toString().trim();
    const rawOcStatus = item.oc_status?.toString().trim();
    const osDesc = (item.os_status_descricao || '').toLowerCase();
    const hasDataEnc = item.oc_data_encerramento && item.oc_data_encerramento.trim().length > 0;

    // 1 = Em Atendimento
    if (rawOsStatus === '2' || rawOcStatus === '2' || osDesc.includes('execuç')) {
      return 1;
    }

    // 2 = Encerrada
    if (rawOsStatus === '1' || rawOcStatus === '1' || osDesc.includes('encerrad') || hasDataEnc) {
      return 2;
    }

    // 0 = Aberta
    return 0;
  };

  const loadChamados = async () => {
    setIsLoading(true);
    try {
      const activeOs = await fetchOrdensDeServicoFromSgp(true, false);
      setChamados(activeOs);
    } catch (e) {
      console.warn('Erro ao carregar Ordens de Serviço:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChamados();
  }, []);

  // Extrai lista única de datas para o Carrossel Calendário (DA MAIS NOVA PARA A MAIS VELHA)
  const dateStrip = useMemo(() => {
    const datesMap: {
      [key: string]: { dayName: string; dayNum: string; monthStr: string; dayMonthStr: string; count: number; ts: number };
    } = {};

    chamados.forEach((item) => {
      const status = getItemStatus(item);
      if (selectedTab === 0 && status !== 0) return;
      if (selectedTab === 1 && status !== 1) return;

      const dateRaw = item.os_data_agendamento || item.oc_data_cadastro || '';
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

  // ORDENAÇÃO ESTRITA DA MAIS NOVA PARA A MAIS VELHA EM TODAS AS VISUALIZAÇÕES
  const filteredChamados = useMemo(() => {
    const list = chamados.filter((item) => {
      const status = getItemStatus(item);
      if (selectedTab === 0 && status !== 0) return false;
      if (selectedTab === 1 && status !== 1) return false;

      // Filtro da Data Selecionada no Calendário
      if (selectedDateFilter !== 'TODAS') {
        const dateRaw = item.os_data_agendamento || item.oc_data_cadastro || '';
        const formatted = formatDateHeader(dateRaw);
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

    // Ordenação estrita: DA MAIS NOVA PARA A MAIS VELHA (dateB - dateA)
    return list.sort((a, b) => {
      const dateA = parseSgpDateToTimestamp(a.os_data_agendamento || a.oc_data_cadastro);
      const dateB = parseSgpDateToTimestamp(b.os_data_agendamento || b.oc_data_cadastro);
      return dateB - dateA;
    });
  }, [chamados, selectedTab, selectedDateFilter, searchQuery]);

  const countAbertas = chamados.filter((x) => getItemStatus(x) === 0).length;
  const countExecucao = chamados.filter((x) => getItemStatus(x) === 1).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.logoBadge}>
            <Feather name="calendar" size={18} color="#38BDF8" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Agenda SGP Técnico</Text>
            <Text style={styles.headerSubtitle}>
              {filteredChamados.length} O.S. (Mais novas primeiro)
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onOpenClientSearch} style={styles.iconBtn} activeOpacity={0.7}>
            <Feather name="users" size={18} color="#38BDF8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={loadChamados} style={styles.iconBtn} activeOpacity={0.7}>
            <Feather name="refresh-cw" size={18} color="#38BDF8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={styles.iconBtn} activeOpacity={0.7}>
            <Feather name="log-out" size={18} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar */}
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

      {/* Modern Status Filter Pills */}
      <View style={styles.pillsRow}>
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.code;
          const count = tab.code === 0 ? countAbertas : countExecucao;

          return (
            <TouchableOpacity
              key={tab.code}
              style={[styles.statusPill, isSelected && styles.statusPillActive]}
              onPress={() => setSelectedTab(tab.code)}
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
              name="layers"
              size={16}
              color={selectedDateFilter === 'TODAS' ? '#0D1117' : '#38BDF8'}
            />
            <Text
              style={[
                styles.dayCardNum,
                { fontSize: 13, marginTop: 4 },
                selectedDateFilter === 'TODAS' && styles.dayCardTextActive,
              ]}
            >
              Todas
            </Text>
          </TouchableOpacity>

          {/* Cards Individuais de Datas (Com DIA/MÊS ex: 18/08) */}
          {dateStrip.map((item) => {
            const isSelected = selectedDateFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.dayCard, isSelected && styles.dayCardActive]}
                onPress={() => setSelectedDateFilter(item.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dayCardName, isSelected && styles.dayCardTextActive]}>
                  {item.dayName}
                </Text>
                <Text style={[styles.dayCardNum, isSelected && styles.dayCardTextActive]}>
                  {item.dayMonthStr}
                </Text>

                <View
                  style={[
                    styles.dayCardDot,
                    isSelected && { backgroundColor: '#0D1117' },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayCardDotText,
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

      {/* Lista de Chamados / Timeline de O.S. */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Carregando agenda SGP...</Text>
        </View>
      ) : filteredChamados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="calendar" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>Nenhuma O.S. Encontrada</Text>
          <Text style={styles.emptySub}>
            Não há registros para a data ou filtro selecionado.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChamados}
          keyExtractor={(item, index) =>
            item.os_id ? `os-${item.os_id}` : `oc-${item.oc_protocolo}-${index}`
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ModernTimelineOsCard chamado={item} onPress={() => onOsClick(item)} />
          )}
        />
      )}
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

  const isEmAtendimento = rawOsStatus === '2' || rawOcStatus === '2' || osDesc.includes('execuç');

  const getStatusColor = () => {
    if (isEmAtendimento) return '#F59E0B'; // Amber (Em Execução)
    return '#38BDF8'; // Cyan/Blue (Aberta)
  };

  const getStatusLabel = () => {
    if (isEmAtendimento) return 'Em Execução';
    return 'Aberta';
  };

  // Horário Formatado da O.S.
  const dateRaw = chamado.os_data_agendamento || chamado.oc_data_cadastro || '';
  let timeStr = '--:--';
  if (dateRaw.includes('T')) {
    const tPart = dateRaw.split('T')[1];
    if (tPart) timeStr = tPart.substring(0, 5);
  } else if (dateRaw.includes(' ')) {
    const tPart = dateRaw.split(' ')[1];
    if (tPart) timeStr = tPart.substring(0, 5);
  }

  const { dayMonthStr } = formatDateHeader(dateRaw);

  // PRIORIZA O PROBLEMA REPORTADO REAL DO CLIENTE (os_conteudo)
  const realProblemDescription =
    chamado.os_conteudo || chamado.oc_conteudo || chamado.os_observacao || chamado.os_motivo_descricao || 'Sem observações';

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: getStatusColor() }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={styles.cardHeaderRow}>
        <View style={styles.timeBadge}>
          <Feather name="clock" size={13} color="#38BDF8" />
          <Text style={styles.timeText}>
            {timeStr !== '--:--' ? `${dayMonthStr} • ${timeStr}` : dayMonthStr}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor()}22` }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={[styles.statusBadgeText, { color: getStatusColor() }]}>
            {getStatusLabel()}
          </Text>
        </View>
      </View>

      <View style={styles.clientRow}>
        <Text style={styles.clientNameText} numberOfLines={1}>
          {chamado.cliente || 'Cliente SGP'}
        </Text>
      </View>

      <Text style={styles.protocolText}>
        {chamado.os_id ? `O.S. #${chamado.os_id} • ` : ''}Prot: {chamado.oc_protocolo || 'N/A'}
      </Text>

      {/* PROBLEMA REPORTADO / DESCRIÇÃO REAL DO ATENDIMENTO */}
      <View style={styles.motivoBox}>
        <Feather name="info" size={14} color="#F59E0B" style={{ marginTop: 2 }} />
        <Text style={styles.motivoText} numberOfLines={2}>
          {realProblemDescription}
        </Text>
      </View>

      <View style={styles.cardFooterRow}>
        {chamado.endereco_bairro ? (
          <View style={styles.footerTag}>
            <Feather name="map-pin" size={12} color="#F59E0B" />
            <Text style={styles.footerTagText} numberOfLines={1}>
              {chamado.endereco_bairro}
            </Text>
          </View>
        ) : null}

        {servico?.servico_login ? (
          <View style={styles.footerTag}>
            <Feather name="wifi" size={12} color="#38BDF8" />
            <Text style={[styles.footerTagText, { color: '#38BDF8' }]} numberOfLines={1}>
              {servico.servico_login}
            </Text>
          </View>
        ) : null}

        <View style={styles.arrowIcon}>
          <Feather name="chevron-right" size={18} color="#64748B" />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#161B22',
    borderBottomWidth: 1,
    borderBottomColor: '#21262D',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#21262D',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: '#F8FAFC',
    fontSize: 14,
  },
  pillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  statusPillActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  statusPillText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: '#0D1117',
    fontWeight: 'bold',
  },
  pillBadge: {
    backgroundColor: '#21262D',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  pillBadgeActive: {
    backgroundColor: 'rgba(13, 17, 23, 0.3)',
  },
  pillBadgeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  pillBadgeTextActive: {
    color: '#0D1117',
  },

  // SWIPEABLE CALENDAR STRIP
  calendarStripContainer: {
    backgroundColor: '#161B22',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#21262D',
    marginBottom: 12,
  },
  calendarStripContent: {
    paddingHorizontal: 16,
  },
  dayCard: {
    width: 66,
    height: 74,
    backgroundColor: '#0D1117',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  dayCardActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  dayCardName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
  },
  dayCardNum: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginVertical: 2,
  },
  dayCardTextActive: {
    color: '#0D1117',
  },
  dayCardDot: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  dayCardDotText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: 'bold',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    padding: 32,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },

  // TIMELINE OS CARD
  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#21262D',
    borderLeftWidth: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  clientRow: {
    marginBottom: 2,
  },
  clientNameText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  protocolText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  motivoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0D1117',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#21262D',
  },
  motivoText: {
    color: '#CBD5E1',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1117',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#21262D',
  },
  footerTagText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
    maxWidth: 120,
  },
  arrowIcon: {
    marginLeft: 'auto',
  },
});
