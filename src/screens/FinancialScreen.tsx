import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  Modal,
  Image,
  KeyboardAvoidingView,
  RefreshControl,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {
  getLoggedTecnicoName,
  getLoggedUserRole,
  sendDespesasWebhook,
  fetchDespesasSupabase,
  DespesaItemSupabase,
} from '../services/webhookService';
import {
  getCurrentSgpDateTime,
  fetchSgpTitulosAbertos,
  fetchSgpTitulosPagos,
  SgpTituloItem,
} from '../services/sgpApi';

interface Props {
  onBackToOsList: () => void;
  onOpenCreateOs: () => void;
  onOpenClientSearch: () => void;
  onOpenOfflineClients: () => void;
  onOpenAuthorizeOnu: () => void;
  onOpenOltConsultation: () => void;
  onLogout: () => void;
}

export const FinancialScreen: React.FC<Props> = ({
  onBackToOsList,
  onOpenCreateOs,
  onOpenClientSearch,
  onOpenOfflineClients,
  onOpenAuthorizeOnu,
  onOpenOltConsultation,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [loggedUser, setLoggedUser] = useState<string>('Usuário');
  const [userRole, setUserRole] = useState<string>('tecnico');
  const [activeTab, setActiveTab] = useState<0 | 1>(0); // 0 = Despesas, 1 = Recebimento
  const [despesaSubTab, setDespesaSubTab] = useState<0 | 1 | 2>(0); // 0 = Despesas, 1 = Abastecimento, 2 = Relatório
  const [recebimentoSubTab, setRecebimentoSubTab] = useState<0 | 1>(0); // 0 = Recebidos, 1 = Relatório
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // SELETOR DE MÊS E ANO
  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showMonthPickerModal, setShowMonthPickerModal] = useState(false);

  // SELETOR DE PERÍODO DE DIAS DENTRO DO MÊS
  const [dayPeriodPreset, setDayPeriodPreset] = useState<'all' | 'first15' | 'last15' | 'custom'>('all');
  const [startDayInput, setStartDayInput] = useState<string>('1');
  const [endDayInput, setEndDayInput] = useState<string>(
    String(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
  );

  // CÁLCULO DOS DIAS INICIAL E FINAL COMPUTADOS
  const maxDaysInSelectedMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  let computedStartDay = 1;
  let computedEndDay = maxDaysInSelectedMonth;

  if (dayPeriodPreset === 'first15') {
    computedStartDay = 1;
    computedEndDay = Math.min(15, maxDaysInSelectedMonth);
  } else if (dayPeriodPreset === 'last15') {
    computedStartDay = 16;
    computedEndDay = maxDaysInSelectedMonth;
  } else if (dayPeriodPreset === 'custom') {
    const parsedStart = parseInt(startDayInput, 10);
    const parsedEnd = parseInt(endDayInput, 10);
    computedStartDay = isNaN(parsedStart) ? 1 : Math.max(1, Math.min(parsedStart, maxDaysInSelectedMonth));
    computedEndDay = isNaN(parsedEnd) ? maxDaysInSelectedMonth : Math.max(computedStartDay, Math.min(parsedEnd, maxDaysInSelectedMonth));
  }

  // FORMULÁRIO DE DESPESAS
  const [descricao, setDescricao] = useState('');
  const [valorDespesa, setValorDespesa] = useState('');
  const [imageUriDespesa, setImageUriDespesa] = useState<string | null>(null);
  const [imageBase64Despesa, setImageBase64Despesa] = useState<string | null>(null);
  const [isSubmittingDespesa, setIsSubmittingDespesa] = useState(false);
  const [successMsgDespesa, setSuccessMsgDespesa] = useState<string | null>(null);

  // FORMULÁRIO DE ABASTECIMENTO
  const [descricaoAbastecimento, setDescricaoAbastecimento] = useState('');
  const [valorAbastecimento, setValorAbastecimento] = useState('');
  const [imageUriAbastecimento, setImageUriAbastecimento] = useState<string | null>(null);
  const [imageBase64Abastecimento, setImageBase64Abastecimento] = useState<string | null>(null);
  const [isSubmittingAbastecimento, setIsSubmittingAbastecimento] = useState(false);
  const [successMsgAbastecimento, setSuccessMsgAbastecimento] = useState<string | null>(null);

  // RELATÓRIO DO SUPABASE
  const [relatorioItems, setRelatorioItems] = useState<DespesaItemSupabase[]>([]);
  const [isLoadingRelatorio, setIsLoadingRelatorio] = useState(false);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);

  // TÍTULOS / RECEBIMENTOS DO SGP (POST /api/ura/titulos/)
  const [titulosAbertos, setTitulosAbertos] = useState<SgpTituloItem[]>([]);
  const [titulosPagos, setTitulosPagos] = useState<SgpTituloItem[]>([]);
  const [isLoadingTitulos, setIsLoadingTitulos] = useState(false);
  const [titulosSearchQuery, setTitulosSearchQuery] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (activeTab === 0 && despesaSubTab === 2) {
      loadRelatorioData();
    } else if (activeTab === 1) {
      if (recebimentoSubTab === 0) {
        loadRelatorioData();
        loadTitulosPagosData();
      } else {
        loadRelatorioData();
        loadTitulosPagosData();
        loadTitulosAbertosData();
      }
    }
  }, [activeTab, despesaSubTab, recebimentoSubTab, selectedMonth, selectedYear, dayPeriodPreset, computedStartDay, computedEndDay]);

  const loadUserData = async () => {
    const name = await getLoggedTecnicoName();
    const role = await getLoggedUserRole();
    if (name) setLoggedUser(name);
    if (role) setUserRole(role);
  };

  const loadRelatorioData = async () => {
    setIsLoadingRelatorio(true);
    try {
      const items = await fetchDespesasSupabase();
      setRelatorioItems(items);
    } catch {
      setRelatorioItems([]);
    } finally {
      setIsLoadingRelatorio(false);
    }
  };

  const loadTitulosAbertosData = async () => {
    setIsLoadingTitulos(true);
    try {
      const list = await fetchSgpTitulosAbertos();
      setTitulosAbertos(list);
    } catch {
      setTitulosAbertos([]);
    } finally {
      setIsLoadingTitulos(false);
    }
  };

  const loadTitulosPagosData = async () => {
    setIsLoadingTitulos(true);
    try {
      const mm = String(selectedMonth + 1).padStart(2, '0');
      const startStr = String(computedStartDay).padStart(2, '0');
      const endStr = String(computedEndDay).padStart(2, '0');
      const start = `${selectedYear}-${mm}-${startStr}`;
      const end = `${selectedYear}-${mm}-${endStr}`;
      const list = await fetchSgpTitulosPagos(start, end);
      setTitulosPagos(list);
    } catch {
      setTitulosPagos([]);
    } finally {
      setIsLoadingTitulos(false);
    }
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleCopyLinhaDigitavel = async (linha?: string) => {
    if (!linha) {
      Alert.alert('Atenção', 'Este título não possui linha digitável cadastrada.');
      return;
    }
    await Clipboard.setStringAsync(linha);
    setCopyNotice('Linha digitável copiada com sucesso!');
    setTimeout(() => setCopyNotice(null), 3000);
  };

  const handleOpenCobrancaLink = (url?: string) => {
    if (!url) {
      Alert.alert('Atenção', 'Link de cobrança indisponível para este título.');
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('Erro', 'Não foi possível abrir o link da cobrança.');
    });
  };

  const hasRecebimentoPermission = (): boolean => {
    const r = userRole.toLowerCase();
    const isAtendente = r.includes('atend');
    const hasFinanceiro = r.includes('finan') || r.includes('financeiro');
    return (isAtendente && hasFinanceiro) || r === 'atendente_financeiro' || r === 'admin';
  };

  // CAPTURA DE IMAGEM PARA DESPESA
  const handleTakePhotoDespesa = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Por favor, conceda acesso à câmera.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setImageUriDespesa(asset.uri);
        if (asset.base64) setImageBase64Despesa(`data:image/jpeg;base64,${asset.base64}`);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar a câmera.');
    }
  };

  const handlePickGalleryDespesa = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Por favor, conceda acesso à galeria.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setImageUriDespesa(asset.uri);
        if (asset.base64) setImageBase64Despesa(`data:image/jpeg;base64,${asset.base64}`);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar a galeria.');
    }
  };

  // CAPTURA DE IMAGEM PARA ABASTECIMENTO
  const handleTakePhotoAbastecimento = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Por favor, conceda acesso à câmera.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setImageUriAbastecimento(asset.uri);
        if (asset.base64) setImageBase64Abastecimento(`data:image/jpeg;base64,${asset.base64}`);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar a câmera.');
    }
  };

  const handlePickGalleryAbastecimento = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Por favor, conceda acesso à galeria.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setImageUriAbastecimento(asset.uri);
        if (asset.base64) setImageBase64Abastecimento(`data:image/jpeg;base64,${asset.base64}`);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar a galeria.');
    }
  };

  // SUBMETER DESPESA
  const handleSaveDespesa = async () => {
    const desc = descricao.trim();
    const valRaw = valorDespesa.trim().replace(',', '.');
    const valNum = parseFloat(valRaw);

    if (!desc) {
      Alert.alert('Atenção', 'Por favor, informe a descrição da despesa.');
      return;
    }
    if (isNaN(valNum) || valNum <= 0) {
      Alert.alert('Atenção', 'Por favor, informe um valor válido para a despesa.');
      return;
    }
    if (!imageBase64Despesa) {
      Alert.alert('Atenção', 'Por favor, insira ou fotografe a foto do comprovante.');
      return;
    }

    setIsSubmittingDespesa(true);
    setSuccessMsgDespesa(null);
    const dataAtualFormatted = getCurrentSgpDateTime();

    try {
      await sendDespesasWebhook({
        tipo: 'despesa',
        descricao: desc,
        valor: valRaw,
        valorNumerico: valNum,
        comprovanteBase64: imageBase64Despesa,
        data: dataAtualFormatted,
        usuario: loggedUser,
      });

      setIsSubmittingDespesa(false);
      setSuccessMsgDespesa(`Despesa de R$ ${valRaw} registrada com sucesso em ${dataAtualFormatted}!`);

      Alert.alert(
        'Despesa Cadastrada com Sucesso! 💸',
        `Descrição: ${desc}\nValor: R$ ${valNum.toFixed(2)}\nData: ${dataAtualFormatted}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setDescricao('');
              setValorDespesa('');
              setImageUriDespesa(null);
              setImageBase64Despesa(null);
            },
          },
        ]
      );
    } catch (e: any) {
      setIsSubmittingDespesa(false);
      Alert.alert('Erro', 'Falha ao registrar a despesa.');
    }
  };

  // SUBMETER ABASTECIMENTO
  const handleSaveAbastecimento = async () => {
    const desc = descricaoAbastecimento.trim() || 'Abastecimento de Veículo';
    const valRaw = valorAbastecimento.trim().replace(',', '.');
    const valNum = parseFloat(valRaw);

    if (!descricaoAbastecimento.trim()) {
      Alert.alert('Atenção', 'Por favor, informe a descrição do abastecimento.');
      return;
    }
    if (isNaN(valNum) || valNum <= 0) {
      Alert.alert('Atenção', 'Por favor, informe um valor válido para o abastecimento.');
      return;
    }
    if (!imageBase64Abastecimento) {
      Alert.alert('Atenção', 'Por favor, insira ou fotografe a foto da nota de abastecimento.');
      return;
    }

    setIsSubmittingAbastecimento(true);
    setSuccessMsgAbastecimento(null);
    const dataAtualFormatted = getCurrentSgpDateTime();

    try {
      await sendDespesasWebhook({
        tipo: 'abastecimento',
        descricao: desc,
        valor: valRaw,
        valorNumerico: valNum,
        comprovanteBase64: imageBase64Abastecimento,
        data: dataAtualFormatted,
        usuario: loggedUser,
      });

      setIsSubmittingAbastecimento(false);
      setSuccessMsgAbastecimento(`Abastecimento de R$ ${valRaw} registrado com sucesso em ${dataAtualFormatted}!`);

      Alert.alert(
        'Abastecimento Cadastrado com Sucesso! ⛽',
        `Descrição: ${desc}\nValor: R$ ${valNum.toFixed(2)}\nData: ${dataAtualFormatted}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setDescricaoAbastecimento('');
              setValorAbastecimento('');
              setImageUriAbastecimento(null);
              setImageBase64Abastecimento(null);
            },
          },
        ]
      );
    } catch (e: any) {
      setIsSubmittingAbastecimento(false);
      Alert.alert('Erro', 'Falha ao registrar o abastecimento.');
    }
  };

  // ESTATÍSTICAS DO RELATÓRIO DE DESPESAS (FILTRADO POR MÊS, ANO E PERÍODO DE DIAS)
  const selectedMonthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const startDayStr = String(computedStartDay).padStart(2, '0');
  const endDayStr = String(computedEndDay).padStart(2, '0');
  const startDateLimit = `${selectedMonthPrefix}-${startDayStr}`;
  const endDateLimit = `${selectedMonthPrefix}-${endDayStr}`;

  const filteredRelatorioItems = relatorioItems.filter((item) => {
    if (!item.data_lancamento) return false;
    return item.data_lancamento >= startDateLimit && item.data_lancamento <= endDateLimit;
  });

  const totalGeral = filteredRelatorioItems.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
  const despesasItems = filteredRelatorioItems.filter((i) => i.tipo === 'despesa');
  const abastecimentosItems = filteredRelatorioItems.filter((i) => i.tipo === 'abastecimento');
  const totalDespesas = despesasItems.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
  const totalAbastecimentos = abastecimentosItems.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);

  // AGRUPAMENTO DE TÍTULOS PAGOS POR USUÁRIO (EXCLUINDO SYSTEM)
  interface UsuarioAgrupado {
    usuario: string;
    quantidade: number;
    totalValor: number;
    formaPagamentoBreakdown: { [forma: string]: { quantidade: number; valor: number } };
  }

  const computeRecebidosPorUsuario = (): UsuarioAgrupado[] => {
    const map: { [usuario: string]: UsuarioAgrupado } = {};

    titulosPagos
      .filter((t) => {
        if (!titulosSearchQuery.trim()) return true;
        const q = titulosSearchQuery.toLowerCase().trim();
        const nome = (t.clienteNome || '').toLowerCase();
        const cpf = (t.clienteCpfcnpj || '').toLowerCase();
        const doc = String(t.numeroDocumento || '').toLowerCase();
        const linha = String(t.linhaDigitavel || '').toLowerCase();
        const barras = String(t.codigoBarras || '').toLowerCase();
        const nossoNum = String(t.nossoNumero || '').toLowerCase();
        return (
          nome.includes(q) ||
          cpf.includes(q) ||
          doc.includes(q) ||
          linha.includes(q) ||
          barras.includes(q) ||
          nossoNum.includes(q)
        );
      })
      .forEach((t) => {
      const uRaw = t.usuario_baixa || 'Outros';
      if (uRaw.toLowerCase() === 'system') return; // Exclui o usuário system

      const valor = Number(t.valorPago || t.valorCorrigido || t.valor) || 0;
      const forma = t.formaPagamento || 'Não Informado';

      if (!map[uRaw]) {
        map[uRaw] = {
          usuario: uRaw,
          quantidade: 0,
          totalValor: 0,
          formaPagamentoBreakdown: {},
        };
      }

      map[uRaw].quantidade += 1;
      map[uRaw].totalValor += valor;

      if (!map[uRaw].formaPagamentoBreakdown[forma]) {
        map[uRaw].formaPagamentoBreakdown[forma] = { quantidade: 0, valor: 0 };
      }
      map[uRaw].formaPagamentoBreakdown[forma].quantidade += 1;
      map[uRaw].formaPagamentoBreakdown[forma].valor += valor;
    });

    return Object.values(map).sort((a, b) => b.totalValor - a.totalValor);
  };

  const totalRecebidoMes = computeRecebidosPorUsuario().reduce((acc, u) => acc + u.totalValor, 0);
  const saldoLiquidoMes = totalRecebidoMes - totalGeral;

  // COMPONENTE VISUAL DO SELETOR DE MÊS E ANO
  const renderMonthSelector = () => {
    return (
      <View style={styles.monthSelectorRow}>
        <TouchableOpacity style={styles.monthSelectorArrowBtn} onPress={handlePrevMonth} activeOpacity={0.7}>
          <Feather name="chevron-left" size={20} color="#38BDF8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.monthSelectorCenterBtn}
          onPress={() => setShowMonthPickerModal(true)}
          activeOpacity={0.8}
        >
          <Feather name="calendar" size={16} color="#38BDF8" style={{ marginRight: 6 }} />
          <Text style={styles.monthSelectorText}>
            {MONTH_NAMES[selectedMonth]} de {selectedYear}
          </Text>
          <Feather name="chevron-down" size={14} color="#94A3B8" style={{ marginLeft: 6 }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.monthSelectorArrowBtn} onPress={handleNextMonth} activeOpacity={0.7}>
          <Feather name="chevron-right" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>
    );
  };

  // COMPONENTE VISUAL DO SELETOR DE PERÍODO DE DIAS DENTRO DO MÊS
  const renderDayPeriodSelector = () => {
    return (
      <View style={styles.dayPeriodContainer}>
        <View style={styles.dayPeriodHeaderRow}>
          <Feather name="filter" size={13} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={styles.dayPeriodTitle}>
            Dias no mês ({String(computedStartDay).padStart(2, '0')} a {String(computedEndDay).padStart(2, '0')}/{String(selectedMonth + 1).padStart(2, '0')}):
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetChipsScroll}>
          <TouchableOpacity
            style={[styles.presetChip, dayPeriodPreset === 'all' && styles.presetChipActive]}
            onPress={() => setDayPeriodPreset('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetChipText, dayPeriodPreset === 'all' && styles.presetChipTextActive]}>
              Mês Inteiro (1 a {maxDaysInSelectedMonth})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetChip, dayPeriodPreset === 'first15' && styles.presetChipActive]}
            onPress={() => setDayPeriodPreset('first15')}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetChipText, dayPeriodPreset === 'first15' && styles.presetChipTextActive]}>
              1º ao 15º dia
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetChip, dayPeriodPreset === 'last15' && styles.presetChipActive]}
            onPress={() => setDayPeriodPreset('last15')}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetChipText, dayPeriodPreset === 'last15' && styles.presetChipTextActive]}>
              16º ao fim ({maxDaysInSelectedMonth})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetChip, dayPeriodPreset === 'custom' && styles.presetChipActive]}
            onPress={() => setDayPeriodPreset('custom')}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetChipText, dayPeriodPreset === 'custom' && styles.presetChipTextActive]}>
              Personalizado ✏️
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {dayPeriodPreset === 'custom' ? (
          <View style={styles.customDayInputsRow}>
            <View style={styles.dayInputBox}>
              <Text style={styles.dayInputLabel}>Dia Inicial:</Text>
              <TextInput
                style={styles.dayTextInput}
                value={startDayInput}
                onChangeText={setStartDayInput}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1"
                placeholderTextColor="#64748B"
              />
            </View>

            <Text style={styles.dayInputSeparator}>até</Text>

            <View style={styles.dayInputBox}>
              <Text style={styles.dayInputLabel}>Dia Final:</Text>
              <TextInput
                style={styles.dayTextInput}
                value={endDayInput}
                onChangeText={setEndDayInput}
                keyboardType="number-pad"
                maxLength={2}
                placeholder={String(maxDaysInSelectedMonth)}
                placeholderTextColor="#64748B"
              />
            </View>

            <TouchableOpacity
              style={styles.applyDayBtn}
              onPress={() => {
                loadRelatorioData();
                loadTitulosPagosData();
              }}
              activeOpacity={0.85}
            >
              <Feather name="check" size={14} color="#0F172A" style={{ marginRight: 4 }} />
              <Text style={styles.applyDayBtnText}>Filtrar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  // MODAL PARA SELEÇÃO DIRETA DE MÊS E ANO
  const renderMonthPickerModal = () => {
    const years = [2024, 2025, 2026, 2027, 2028];
    return (
      <Modal
        visible={showMonthPickerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMonthPickerModal(false)}
      >
        <TouchableOpacity
          style={styles.monthPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowMonthPickerModal(false)}
        >
          <View style={styles.monthPickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.monthPickerHeader}>
              <Text style={styles.monthPickerTitle}>Selecione o Mês e Ano</Text>
              <TouchableOpacity onPress={() => setShowMonthPickerModal(false)}>
                <Feather name="x" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.monthPickerLabel}>Ano</Text>
            <View style={styles.yearGrid}>
              {years.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearBtn, selectedYear === y && styles.yearBtnActive]}
                  onPress={() => setSelectedYear(y)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.yearBtnText, selectedYear === y && styles.yearBtnTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.monthPickerLabel, { marginTop: 16 }]}>Mês</Text>
            <View style={styles.monthGrid}>
              {MONTH_NAMES.map((name, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.monthBtn, selectedMonth === index && styles.monthBtnActive]}
                  onPress={() => {
                    setSelectedMonth(index);
                    setShowMonthPickerModal(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.monthBtnText, selectedMonth === index && styles.monthBtnTextActive]}>
                    {name.substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setIsMenuOpen(true)} activeOpacity={0.7}>
          <Feather name="menu" size={22} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Financeiro</Text>
          <Text style={styles.headerSubtitle}>Módulo Administrativo • {loggedUser}</Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={onBackToOsList} activeOpacity={0.8}>
          <Feather name="arrow-left" size={16} color="#0F172A" />
          <Text style={styles.backBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>

      {/* ABAS PRINCIPAIS: DESPESAS E RECEBIMENTO */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 0 && styles.tabButtonActive]}
          onPress={() => setActiveTab(0)}
          activeOpacity={0.8}
        >
          <Feather name="minus-circle" size={16} color={activeTab === 0 ? '#38BDF8' : '#64748B'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 0 && styles.tabTextActive]}>Despesas</Text>
        </TouchableOpacity>

        {hasRecebimentoPermission() ? (
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 1 && styles.tabButtonActive]}
            onPress={() => setActiveTab(1)}
            activeOpacity={0.8}
          >
            <Feather name="plus-circle" size={16} color={activeTab === 1 ? '#10B981' : '#64748B'} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, activeTab === 1 && styles.tabTextActive]}>Recebimento</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            activeTab === 0 && despesaSubTab === 2 ? (
              <RefreshControl refreshing={isLoadingRelatorio} onRefresh={loadRelatorioData} tintColor="#38BDF8" />
            ) : undefined
          }
        >
          {activeTab === 0 ? (
            /* CONTEÚDO DA ABA DESPESAS (COM 3 SUB-ABAS: DESPESAS, ABASTECIMENTO, RELATÓRIO) */
            <View style={{ width: '100%' }}>
              <View style={styles.subTabContainer}>
                <TouchableOpacity
                  style={[styles.subTabButton, despesaSubTab === 0 && styles.subTabButtonActive]}
                  onPress={() => setDespesaSubTab(0)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subTabText, despesaSubTab === 0 && styles.subTabTextActive]}>Despesas</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.subTabButton, despesaSubTab === 1 && styles.subTabButtonActive]}
                  onPress={() => setDespesaSubTab(1)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subTabText, despesaSubTab === 1 && styles.subTabTextActive]}>Abastecimento</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.subTabButton, despesaSubTab === 2 && styles.subTabButtonActive]}
                  onPress={() => setDespesaSubTab(2)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subTabText, despesaSubTab === 2 && styles.subTabTextActive]}>Relatório</Text>
                </TouchableOpacity>
              </View>

              {despesaSubTab === 0 ? (
                /* SUB-ABA 1: FORMULÁRIO DE CADASTRAR DESPESAS */
                <View style={styles.card}>
                  <View style={styles.cardTitleRow}>
                    <Feather name="file-plus" size={20} color="#38BDF8" style={{ marginRight: 8 }} />
                    <Text style={styles.cardTitle}>Cadastrar Nova Despesa</Text>
                  </View>

                  {successMsgDespesa ? (
                    <View style={styles.successBanner}>
                      <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 8 }} />
                      <Text style={styles.successBannerText}>{successMsgDespesa}</Text>
                    </View>
                  ) : null}

                  <View style={styles.dateInfoBox}>
                    <Feather name="clock" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                    <Text style={styles.dateInfoText}>Data de Lançamento: {getCurrentSgpDateTime()}</Text>
                  </View>

                  <Text style={styles.inputLabel}>DESCRIÇÃO DA DESPESA:</Text>
                  <TextInput
                    style={styles.input}
                    value={descricao}
                    onChangeText={setDescricao}
                    placeholder="Ex: Almoço em campo, Peça de reposição, Pedágio..."
                    placeholderTextColor="#64748B"
                  />

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>VALOR (R$):</Text>
                  <View style={styles.moneyInputRow}>
                    <Text style={styles.currencyPrefix}>R$</Text>
                    <TextInput
                      style={styles.moneyInput}
                      value={valorDespesa}
                      onChangeText={setValorDespesa}
                      placeholder="0,00"
                      placeholderTextColor="#64748B"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 16 }]}>FOTO DO COMPROVANTE / RECIBO:</Text>
                  {imageUriDespesa ? (
                    <View style={styles.imagePreviewContainer}>
                      <Image source={{ uri: imageUriDespesa }} style={styles.imagePreview} />
                      <View style={styles.imageActionsRow}>
                        <View style={styles.imageAttachedBadge}>
                          <Feather name="check-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                          <Text style={styles.imageAttachedText}>Comprovante Anexado</Text>
                        </View>
                        <TouchableOpacity style={styles.removePhotoBtn} onPress={() => { setImageUriDespesa(null); setImageBase64Despesa(null); }} activeOpacity={0.7}>
                          <Feather name="trash-2" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                          <Text style={styles.removePhotoBtnText}>Remover</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoPickerRow}>
                      <TouchableOpacity style={styles.photoPickerBtn} onPress={handleTakePhotoDespesa} activeOpacity={0.8}>
                        <Feather name="camera" size={20} color="#38BDF8" />
                        <Text style={styles.photoPickerBtnText}>Tirar Foto</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickGalleryDespesa} activeOpacity={0.8}>
                        <Feather name="image" size={20} color="#38BDF8" />
                        <Text style={styles.photoPickerBtnText}>Galeria</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.saveBtn, isSubmittingDespesa && { opacity: 0.6 }]}
                    onPress={handleSaveDespesa}
                    disabled={isSubmittingDespesa}
                    activeOpacity={0.85}
                  >
                    {isSubmittingDespesa ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <>
                        <Feather name="save" size={18} color="#0F172A" style={{ marginRight: 8 }} />
                        <Text style={styles.saveBtnText}>SALVAR DESPESA</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : despesaSubTab === 1 ? (
                /* SUB-ABA 2: FORMULÁRIO DE CADASTRAR ABASTECIMENTO */
                <View style={styles.card}>
                  <View style={styles.cardTitleRow}>
                    <Feather name="droplet" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                    <Text style={[styles.cardTitle, { color: '#F59E0B' }]}>Cadastrar Abastecimento</Text>
                  </View>

                  {successMsgAbastecimento ? (
                    <View style={styles.successBanner}>
                      <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 8 }} />
                      <Text style={styles.successBannerText}>{successMsgAbastecimento}</Text>
                    </View>
                  ) : null}

                  <View style={styles.dateInfoBox}>
                    <Feather name="clock" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                    <Text style={styles.dateInfoText}>Data de Lançamento: {getCurrentSgpDateTime()}</Text>
                  </View>

                  {/* CAMPO DESCRIÇÃO ABASTECIMENTO */}
                  <Text style={[styles.inputLabel, { color: '#F59E0B' }]}>DESCRIÇÃO DO ABASTECIMENTO:</Text>
                  <TextInput
                    style={styles.input}
                    value={descricaoAbastecimento}
                    onChangeText={setDescricaoAbastecimento}
                    placeholder="Ex: Veículo Placa ABC-1234, Posto Shell..."
                    placeholderTextColor="#64748B"
                  />

                  {/* CAMPO VALOR ABASTECIMENTO */}
                  <Text style={[styles.inputLabel, { color: '#F59E0B', marginTop: 14 }]}>VALOR DO ABASTECIMENTO (R$):</Text>
                  <View style={styles.moneyInputRow}>
                    <Text style={[styles.currencyPrefix, { color: '#F59E0B' }]}>R$</Text>
                    <TextInput
                      style={styles.moneyInput}
                      value={valorAbastecimento}
                      onChangeText={setValorAbastecimento}
                      placeholder="0,00"
                      placeholderTextColor="#64748B"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* FOTO DA NOTA DE ABASTECIMENTO */}
                  <Text style={[styles.inputLabel, { marginTop: 16 }]}>FOTO DA NOTA DE ABASTECIMENTO:</Text>
                  {imageUriAbastecimento ? (
                    <View style={styles.imagePreviewContainer}>
                      <Image source={{ uri: imageUriAbastecimento }} style={styles.imagePreview} />
                      <View style={styles.imageActionsRow}>
                        <View style={styles.imageAttachedBadge}>
                          <Feather name="check-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                          <Text style={styles.imageAttachedText}>Nota Anexada</Text>
                        </View>
                        <TouchableOpacity style={styles.removePhotoBtn} onPress={() => { setImageUriAbastecimento(null); setImageBase64Abastecimento(null); }} activeOpacity={0.7}>
                          <Feather name="trash-2" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                          <Text style={styles.removePhotoBtnText}>Remover</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoPickerRow}>
                      <TouchableOpacity style={styles.photoPickerBtn} onPress={handleTakePhotoAbastecimento} activeOpacity={0.8}>
                        <Feather name="camera" size={20} color="#F59E0B" />
                        <Text style={styles.photoPickerBtnText}>Tirar Foto</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickGalleryAbastecimento} activeOpacity={0.8}>
                        <Feather name="image" size={20} color="#F59E0B" />
                        <Text style={styles.photoPickerBtnText}>Galeria</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* BOTÃO SALVAR ABASTECIMENTO */}
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: '#F59E0B' }, isSubmittingAbastecimento && { opacity: 0.6 }]}
                    onPress={handleSaveAbastecimento}
                    disabled={isSubmittingAbastecimento}
                    activeOpacity={0.85}
                  >
                    {isSubmittingAbastecimento ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <>
                        <Feather name="save" size={18} color="#0F172A" style={{ marginRight: 8 }} />
                        <Text style={styles.saveBtnText}>SALVAR ABASTECIMENTO</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* SUB-ABA 3: RELATÓRIO FINANCEIRO */
                <View style={{ width: '100%' }}>
                  {/* SELETOR DE MÊS, ANO E PERÍODO DE DIAS */}
                  {renderMonthSelector()}
                  {renderDayPeriodSelector()}

                  {/* BARRA SUPERIOR DE AÇÕES E REFRESH */}
                  <View style={styles.reportHeaderRow}>
                    <Text style={styles.reportTitle}>Relatório Financeiro</Text>
                    <TouchableOpacity style={styles.refreshBtn} onPress={loadRelatorioData} activeOpacity={0.8}>
                      <Feather name="refresh-cw" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                      <Text style={styles.refreshBtnText}>Atualizar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* CARDS RESUMO TOTALIZADOR */}
                  <View style={styles.statsContainer}>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>Total Lançado</Text>
                      <Text style={styles.statValue}>R$ {totalGeral.toFixed(2)}</Text>
                      <Text style={styles.statSubText}>{filteredRelatorioItems.length} registros</Text>
                    </View>

                    <View style={styles.statCard}>
                      <Text style={[styles.statLabel, { color: '#38BDF8' }]}>Despesas</Text>
                      <Text style={[styles.statValue, { color: '#38BDF8' }]}>R$ {totalDespesas.toFixed(2)}</Text>
                      <Text style={styles.statSubText}>{despesasItems.length} registros</Text>
                    </View>

                    <View style={styles.statCard}>
                      <Text style={[styles.statLabel, { color: '#F59E0B' }]}>Abastecimento</Text>
                      <Text style={[styles.statValue, { color: '#F59E0B' }]}>R$ {totalAbastecimentos.toFixed(2)}</Text>
                      <Text style={styles.statSubText}>{abastecimentosItems.length} registros</Text>
                    </View>
                  </View>

                  {/* LISTAGEM DOS ITENS */}
                  {isLoadingRelatorio ? (
                    <View style={styles.loadingBox}>
                      <ActivityIndicator size="large" color="#38BDF8" />
                      <Text style={styles.loadingText}>Carregando relatório financeiro...</Text>
                    </View>
                  ) : filteredRelatorioItems.length === 0 ? (
                    <View style={styles.placeholderCard}>
                      <View style={styles.iconCircle}>
                        <Feather name="inbox" size={32} color="#94A3B8" />
                      </View>
                      <Text style={styles.cardTitle}>Nenhum registro em {MONTH_NAMES[selectedMonth]}</Text>
                      <Text style={styles.cardSubText}>
                        Nenhum lançamento efetuado em Despesas e Abastecimento foi encontrado neste mês.
                      </Text>
                    </View>
                  ) : (
                    filteredRelatorioItems.map((item, index) => {
                      const isFuel = item.tipo === 'abastecimento';
                      const badgeColor = isFuel ? '#F59E0B' : '#38BDF8';
                      const badgeBg = isFuel ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)';
                      const itemVal = Number(item.valor) || 0;

                      return (
                        <View key={item.id || index} style={styles.reportItemCard}>
                          <View style={styles.reportItemHeader}>
                            <View style={[styles.reportItemBadge, { backgroundColor: badgeBg }]}>
                              <Feather name={isFuel ? 'droplet' : 'minus-circle'} size={12} color={badgeColor} style={{ marginRight: 4 }} />
                              <Text style={[styles.reportItemBadgeText, { color: badgeColor }]}>
                                {item.tipo.toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.reportItemValue}>R$ {itemVal.toFixed(2)}</Text>
                          </View>

                          <Text style={styles.reportItemDesc}>{item.descricao || 'Sem descrição'}</Text>

                          <View style={styles.reportItemFooter}>
                            <View style={styles.reportItemMeta}>
                              <Feather name="clock" size={12} color="#64748B" style={{ marginRight: 4 }} />
                              <Text style={styles.reportItemMetaText}>{item.data_lancamento || 'Data N/I'}</Text>
                            </View>

                            <View style={styles.reportItemMeta}>
                              <Feather name="user" size={12} color="#64748B" style={{ marginRight: 4 }} />
                              <Text style={styles.reportItemMetaText}>{item.usuario || 'Usuário'}</Text>
                            </View>

                            {item.comprovante_base64 ? (
                              <TouchableOpacity
                                style={styles.viewPhotoBadge}
                                onPress={() => setSelectedPhotoModal(item.comprovante_base64 || null)}
                                activeOpacity={0.7}
                              >
                                <Feather name="image" size={12} color="#10B981" style={{ marginRight: 4 }} />
                                <Text style={styles.viewPhotoBadgeText}>Ver Comprovante</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          ) : (
            /* CONTEÚDO DA ABA RECEBIMENTO (COM 2 SUB-ABAS: RECEBIDOS E RELATÓRIO) */
            <View style={{ width: '100%' }}>
              {/* ALERTA DE CÓPIA DE LINHA DIGITÁVEL */}
              {copyNotice ? (
                <View style={styles.successBanner}>
                  <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 8 }} />
                  <Text style={styles.successBannerText}>{copyNotice}</Text>
                </View>
              ) : null}

              {/* SUB-ABAS DE RECEBIMENTO */}
              <View style={styles.subTabContainer}>
                <TouchableOpacity
                  style={[styles.subTabButton, recebimentoSubTab === 0 && styles.subTabButtonActive]}
                  onPress={() => setRecebimentoSubTab(0)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subTabText, recebimentoSubTab === 0 && styles.subTabTextActive]}>Recebidos</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.subTabButton, recebimentoSubTab === 1 && styles.subTabButtonActive]}
                  onPress={() => setRecebimentoSubTab(1)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subTabText, recebimentoSubTab === 1 && styles.subTabTextActive]}>Relatório</Text>
                </TouchableOpacity>
              </View>

              {recebimentoSubTab === 0 ? (
                /* SUB-ABA 1: RECEBIDOS (SOMENTE ITENS E VALORES POR USUÁRIO NO MÊS - EXCLUINDO SYSTEM) */
                <View style={{ width: '100%' }}>
                  {/* SELETOR DE MÊS, ANO E PERÍODO DE DIAS */}
                  {renderMonthSelector()}
                  {renderDayPeriodSelector()}

                  {/* CAMPO DE BUSCA DE TÍTULOS COM BOTÃO DE ESCANEAR CÓDIGO DE BARRAS */}
                  <View style={styles.searchBoxRow}>
                    <Feather name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.searchInputText}
                      value={titulosSearchQuery}
                      onChangeText={setTitulosSearchQuery}
                      placeholder="Buscar cliente, doc ou código de barras..."
                      placeholderTextColor="#64748B"
                    />
                    {titulosSearchQuery ? (
                      <TouchableOpacity onPress={() => setTitulosSearchQuery('')} style={{ marginRight: 8 }}>
                        <Feather name="x" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* BARRA SUPERIOR DE AÇÕES E REFRESH */}
                  <View style={styles.reportHeaderRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.reportTitle}>Recebimentos por Atendente</Text>
                      <Text style={styles.statSubText}>
                        Total Recebido no Mês: R$ {totalRecebidoMes.toFixed(2)} (
                        {computeRecebidosPorUsuario().reduce((acc, u) => acc + u.quantidade, 0)} títulos)
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.refreshBtn}
                      onPress={loadTitulosPagosData}
                      activeOpacity={0.8}
                    >
                      <Feather name="refresh-cw" size={14} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={[styles.refreshBtnText, { color: '#10B981' }]}>Atualizar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* LISTAGEM DOS RECEBIMENTOS AGRUPADOS POR USUÁRIO */}
                  {isLoadingTitulos ? (
                    <View style={styles.loadingBox}>
                      <ActivityIndicator size="large" color="#10B981" />
                      <Text style={styles.loadingText}>Buscando recebimentos do SGP...</Text>
                    </View>
                  ) : computeRecebidosPorUsuario().length === 0 ? (
                    <View style={styles.placeholderCard}>
                      <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Feather name="inbox" size={32} color="#10B981" />
                      </View>
                      <Text style={styles.cardTitle}>Nenhum recebimento encontrado</Text>
                      <Text style={styles.cardSubText}>
                        Nenhum título pago por atendente foi localizado em {MONTH_NAMES[selectedMonth]} de {selectedYear}.
                      </Text>
                    </View>
                  ) : (
                    computeRecebidosPorUsuario().map((uItem, idx) => (
                      <View key={idx} style={styles.usuarioCard}>
                        <View style={styles.usuarioHeaderRow}>
                          <View style={styles.usuarioAvatarCircle}>
                            <Feather name="user" size={18} color="#10B981" />
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.usuarioNomeText}>{uItem.usuario}</Text>
                            <Text style={styles.usuarioMetaText}>{uItem.quantidade} títulos recebidos</Text>
                          </View>
                          <Text style={styles.usuarioTotalValorText}>R$ {uItem.totalValor.toFixed(2)}</Text>
                        </View>

                        {/* DETALHAMENTO DE FORMAS DE PAGAMENTO */}
                        <View style={styles.formaPagamentoDivider} />
                        <View style={styles.formaPagamentoGrid}>
                          {Object.entries(uItem.formaPagamentoBreakdown).map(([forma, data], fIdx) => (
                            <View key={fIdx} style={styles.formaPagamentoItem}>
                              <Text style={styles.formaPagamentoLabel}>{forma}</Text>
                              <Text style={styles.formaPagamentoValue}>
                                R$ {data.valor.toFixed(2)} ({data.quantidade})
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              ) : (
                /* SUB-ABA 2: RELATÓRIO (BALANÇO FINANCEIRO DO MÊS: RECEBIDOS SEM SYSTEM - DESPESAS) */
                <View style={{ width: '100%' }}>
                  {/* SELETOR DE MÊS, ANO E PERÍODO DE DIAS */}
                  {renderMonthSelector()}
                  {renderDayPeriodSelector()}

                  {/* BARRA SUPERIOR DE AÇÕES E REFRESH */}
                  <View style={styles.reportHeaderRow}>
                    <Text style={styles.reportTitle}>Relatório de Balanço Financeiro</Text>
                    <TouchableOpacity
                      style={styles.refreshBtn}
                      onPress={() => {
                        loadRelatorioData();
                        loadTitulosPagosData();
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="refresh-cw" size={14} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={[styles.refreshBtnText, { color: '#10B981' }]}>Atualizar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* CARDS RESUMO FINANCEIRO DO MÊS: RECEBIDOS - DESPESAS = SALDO LÍQUIDO */}
                  <View style={styles.statsContainer}>
                    <View style={styles.statCard}>
                      <Text style={[styles.statLabel, { color: '#10B981' }]}>Recebido (Mês)</Text>
                      <Text style={[styles.statValue, { color: '#10B981' }]}>R$ {totalRecebidoMes.toFixed(2)}</Text>
                      <Text style={styles.statSubText}>sem usuário system</Text>
                    </View>

                    <View style={styles.statCard}>
                      <Text style={[styles.statLabel, { color: '#EF4444' }]}>Despesas (Mês)</Text>
                      <Text style={[styles.statValue, { color: '#EF4444' }]}>R$ {totalGeral.toFixed(2)}</Text>
                      <Text style={styles.statSubText}>{filteredRelatorioItems.length} registros</Text>
                    </View>

                    <View style={styles.statCard}>
                      <Text style={[styles.statLabel, { color: saldoLiquidoMes >= 0 ? '#38BDF8' : '#F59E0B' }]}>
                        Saldo Líquido
                      </Text>
                      <Text style={[styles.statValue, { color: saldoLiquidoMes >= 0 ? '#38BDF8' : '#EF4444' }]}>
                        R$ {saldoLiquidoMes.toFixed(2)}
                      </Text>
                      <Text style={styles.statSubText}>{saldoLiquidoMes >= 0 ? 'Lucro do Mês' : 'Déficit do Mês'}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL DE VISUALIZAÇÃO DE FOTO DO COMPROVANTE */}
      <Modal
        visible={Boolean(selectedPhotoModal)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPhotoModal(null)}
      >
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalContent}>
            <View style={styles.photoModalHeader}>
              <Text style={styles.photoModalTitle}>Comprovante Anexado</Text>
              <TouchableOpacity onPress={() => setSelectedPhotoModal(null)} style={styles.closePhotoBtn}>
                <Feather name="x" size={24} color="#F8FAFC" />
              </TouchableOpacity>
            </View>
            {selectedPhotoModal ? (
              <Image source={{ uri: selectedPhotoModal }} style={styles.fullPhoto} />
            ) : null}
          </View>
        </View>
      </Modal>

      {/* MODAL DE SELEÇÃO DE MÊS E ANO */}
      {renderMonthPickerModal()}

      {/* MODAL MENU HAMBÚRGUER (DRAWER LATERAL ESQUERDO MODERNO) */}
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
                  {loggedUser || 'Técnico de Campo'}
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

              {/* ITEM 1: CRIAR O.S. */}
              <TouchableOpacity
                style={[styles.menuItemRow, styles.menuItemRowHighlight]}
                onPress={() => {
                  setIsMenuOpen(false);
                  onOpenCreateOs();
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
                style={styles.menuItemRow}
                onPress={() => {
                  setIsMenuOpen(false);
                  onBackToOsList();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                  <Feather name="calendar" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Ordens de Serviço</Text>
                  <Text style={styles.menuItemSubText}>Agenda de chamados</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#475569" />
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
                  onOpenAuthorizeOnu();
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
                  onOpenOltConsultation();
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

              {/* ITEM 7: FINANCEIRO (ATIVO) */}
              <TouchableOpacity
                style={[styles.menuItemRow, styles.menuItemRowActive]}
                onPress={() => setIsMenuOpen(false)}
                activeOpacity={0.75}
              >
                <View style={[styles.menuItemIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Feather name="dollar-sign" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: '#10B981', fontWeight: '700' }]}>
                    Financeiro
                  </Text>
                  <Text style={styles.menuItemSubText}>Despesas e abastecimento</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#10B981" />
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
              <Text style={styles.drawerVersionText}>Vega Sync • v1.0.0</Text>
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
    paddingVertical: 14,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  menuBtn: {
    padding: 6,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#38BDF8',
  },
  tabText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
  },
  subTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  subTabButtonActive: {
    backgroundColor: '#38BDF8',
  },
  subTabText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  subTabTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  successBannerText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  dateInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F17',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  dateInfoText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  inputLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0B0F17',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  moneyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F17',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  photoPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F17',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginHorizontal: 4,
  },
  photoPickerBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  imagePreviewContainer: {
    backgroundColor: '#0B0F17',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  imageActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  imageAttachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageAttachedText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removePhotoBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  saveBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
  },

  placeholderCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardSubText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ESTILOS DO RELATÓRIO DO SUPABASE
  reportHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: 'bold',
  },
  statSubText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
  },
  reportItemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  reportItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reportItemBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  reportItemValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  reportItemDesc: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  reportItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
  },
  reportItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportItemMetaText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  viewPhotoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewPhotoBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: 'bold',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoModalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoModalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closePhotoBtn: {
    padding: 4,
  },
  fullPhoto: {
    width: '100%',
    height: 380,
    borderRadius: 12,
    resizeMode: 'contain',
  },

  // DRAWER MENU STYLES
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
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
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

  // ESTILOS DE RECEBIMENTOS E TÍTULOS DO SGP
  searchBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  searchInputText: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    padding: 0,
  },
  tituloCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tituloHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  clienteInfoColumn: {
    flex: 1,
    marginRight: 10,
  },
  clienteNomeText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  clienteMetaText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  tituloValorText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tituloBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadgeOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  statusBadgeOpenText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  portadorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  portadorBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tituloActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 10,
  },
  copyLinhaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  copyLinhaBtnText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  openCobrancaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openCobrancaBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ESTILOS DO SELETOR DE MÊS E ANO
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  monthSelectorArrowBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  monthSelectorCenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  monthSelectorText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // ESTILOS DO MODAL SELETOR DE MÊS
  monthPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  monthPickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  monthPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthPickerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  monthPickerLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearBtn: {
    flex: 1,
    minWidth: '18%',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
  },
  yearBtnActive: {
    backgroundColor: '#38BDF8',
  },
  yearBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  yearBtnTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthBtn: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
  },
  monthBtnActive: {
    backgroundColor: '#38BDF8',
  },
  monthBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  monthBtnTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },

  // ESTILOS DE USUÁRIOS E RECEBIDOS
  usuarioCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  usuarioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usuarioAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  usuarioNomeText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  usuarioMetaText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  usuarioTotalValorText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  formaPagamentoDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  formaPagamentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formaPagamentoItem: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  formaPagamentoLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  formaPagamentoValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },

  // ESTILOS DO SELETOR DE PERÍODO DE DIAS
  dayPeriodContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  dayPeriodHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayPeriodTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
  },
  presetChipsScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  presetChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  presetChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#10B981',
    fontWeight: 'bold',
  },
  customDayInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  dayInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayInputLabel: {
    color: '#64748B',
    fontSize: 11,
    marginRight: 4,
  },
  dayTextInput: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
    padding: 0,
  },
  dayInputSeparator: {
    color: '#64748B',
    fontSize: 11,
    marginHorizontal: 8,
  },
  applyDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  applyDayBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
