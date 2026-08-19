import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  StatusBar,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import {
  OltItem,
  UnauthOnuItem,
  UraClienteItem,
  UraClienteContrato,
  fetchOltsListSgp,
  fetchUnauthOnusForOltSgp,
  searchClientesSgp,
  authorizeOnuSgp,
  fetchSgpOnuTemplates,
  fetchSgpOnuTypes,
  fetchSgpOnuModes,
} from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onBackToOs: () => void;
}

export const AuthorizeOnuScreen: React.FC<Props> = ({ onBackToOs }) => {
  const [olts, setOlts] = useState<OltItem[]>([]);
  const [isLoadingOlts, setIsLoadingOlts] = useState(true);
  const [selectedOlt, setSelectedOlt] = useState<OltItem | null>(null);
  const [unauthOnus, setUnauthOnus] = useState<UnauthOnuItem[]>([]);
  const [isLoadingUnauth, setIsLoadingUnauth] = useState(false);

  // MODAL E WIZARD DE AUTORIZAÇÃO DA ONU (3 ETAPAS)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOnu, setSelectedOnu] = useState<UnauthOnuItem | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1); // 1 = Buscar Cliente, 2 = Formulário

  // ETAPA 1: BUSCA DE CLIENTE POR NOME OU CPF
  const [clientQuery, setClientQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UraClienteItem[]>([]);
  const [isSearchingClient, setIsSearchingClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<UraClienteItem | null>(null);
  const [selectedContract, setSelectedContract] = useState<UraClienteContrato | null>(null);

  // ETAPA 2: FORMULÁRIO DE PROVISIONAMENTO
  const [contratoId, setContratoId] = useState('');
  const [servicoLogin, setServicoLogin] = useState('');
  const [modo, setModo] = useState('PPPoE'); // PPPoE, Router, Bridge
  const [onuTipo, setOnuTipo] = useState('GPON'); // SGP ONU Type
  const [onuTemplate, setOnuTemplate] = useState('DEFAULT'); // SGP OLT Template
  const [vlan, setVlan] = useState(''); // NÃO PREENCHIDO POR PADRÃO
  const [descricao, setDescricao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // BANNER DE NOTIFICAÇÃO DENTRO DO MODAL
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // SELEÇÃO EM LISTA SGP (OVERLAY INLINE)
  const [pickerConfig, setPickerConfig] = useState<{
    visible: boolean;
    title: string;
    options: string[];
    currentValue: string;
    onSelect: (val: string) => void;
  }>({
    visible: false,
    title: '',
    options: [],
    currentValue: '',
    onSelect: () => {},
  });

  const loadOlts = async () => {
    setIsLoadingOlts(true);
    setSelectedOlt(null);
    setUnauthOnus([]);
    try {
      const data = await fetchOltsListSgp();
      setOlts(data);
    } catch (e) {
      setOlts([]);
    } finally {
      setIsLoadingOlts(false);
    }
  };

  useEffect(() => {
    loadOlts();
  }, []);

  const handleSelectOlt = async (olt: OltItem) => {
    setSelectedOlt(olt);
    setIsLoadingUnauth(true);
    setUnauthOnus([]);

    try {
      const onus = await fetchUnauthOnusForOltSgp(olt.id);
      setUnauthOnus(onus);
    } catch (e) {
      setUnauthOnus([]);
    } finally {
      setIsLoadingUnauth(false);
    }
  };

  const handleStartAuthorize = (item: UnauthOnuItem) => {
    setSelectedOnu(item);
    setWizardStep(1);
    setClientQuery('');
    setSearchResults([]);
    setSelectedClient(null);
    setSelectedContract(null);
    setContratoId('');
    setServicoLogin('');
    setVlan(''); // VLAN NÃO PREENCHIDA POR PADRÃO
    setDescricao('');
    setFormError(null);
    setFormSuccess(null);

    // Preenche ONU Tipo e Template vindos da API do SGP
    if (item.type) {
      setOnuTipo(item.type);
    } else {
      setOnuTipo('GPON');
    }

    if (selectedOlt?.olttype) {
      setOnuTemplate(selectedOlt.olttype);
    } else {
      setOnuTemplate('DEFAULT');
    }

    setPickerConfig((p) => ({ ...p, visible: false }));
    setIsModalOpen(true);
  };

  const handleSearchClient = async () => {
    Keyboard.dismiss();
    setFormError(null);
    const q = clientQuery.trim();
    if (!q) {
      setFormError('Digite o nome ou CPF do cliente para buscar.');
      return;
    }

    setIsSearchingClient(true);
    try {
      const results = await searchClientesSgp(q);
      setSearchResults(results);
      if (results.length === 0) {
        setFormError(`Nenhum cliente encontrado para "${q}". Tente buscar por CPF ou outro nome.`);
      }
    } catch (e) {
      setSearchResults([]);
      setFormError('Erro ao consultar clientes no SGP.');
    } finally {
      setIsSearchingClient(false);
    }
  };

  const handleSelectClientContract = (client: UraClienteItem, contract: UraClienteContrato) => {
    Keyboard.dismiss();
    setFormError(null);
    const servico = contract.servicos?.[0];
    const loginStr = servico?.login || contract.contratoCentralLogin || '';
    const idStr = String(contract.id);

    setSelectedClient(client);
    setSelectedContract(contract);
    setContratoId(idStr);
    setServicoLogin(loginStr);
    setVlan(''); // VLAN fica vazia conforme solicitado

    // DESCRIÇÃO INICIA OBRIGATORIAMENTE COM O NOME DO CLIENTE
    setDescricao(`${client.nome} - Contrato #${idStr}`);

    // Avança automaticamente para a Etapa 2
    setWizardStep(2);
  };

  const [onuTemplateId, setOnuTemplateId] = useState('1');
  const [onuTemplateLabel, setOnuTemplateLabel] = useState('Template ONU/ONT');

  // MONTA AS LISTAS REAIS DO SGP PARA O SELETOR EM LISTA
  const openModoPicker = async () => {
    Keyboard.dismiss();
    setFormError(null);
    setPickerConfig({
      visible: true,
      title: 'Selecione o Modo de Operação',
      options: ['PPPoE', 'Bridge', 'Bridge WAN', 'DHCP / Router'],
      currentValue: modo,
      onSelect: (val) => {
        setModo(val);
        setPickerConfig((p) => ({ ...p, visible: false }));
      },
    });
  };

  const openOnuTipoPicker = async () => {
    Keyboard.dismiss();
    setFormError(null);
    const types = await fetchSgpOnuTypes(selectedOlt?.id);
    const sgpTypes: string[] = [];
    if (selectedOnu?.type) sgpTypes.push(selectedOnu.type);
    types.forEach((t) => {
      if (!sgpTypes.includes(t)) sgpTypes.push(t);
    });

    setPickerConfig({
      visible: true,
      title: 'Selecione o Tipo de ONU',
      options: sgpTypes,
      currentValue: onuTipo,
      onSelect: (val) => {
        setOnuTipo(val);
        setPickerConfig((p) => ({ ...p, visible: false }));
      },
    });
  };

  const openOnuTemplatePicker = async () => {
    Keyboard.dismiss();
    setFormError(null);
    const templates = await fetchSgpOnuTemplates();
    const options = templates.map((t) => t.label);

    setPickerConfig({
      visible: true,
      title: 'Selecione o ONU Template',
      options: options,
      currentValue: onuTemplateLabel,
      onSelect: (val) => {
        const found = templates.find((t) => t.label === val);
        if (found) {
          setOnuTemplateId(found.id);
          setOnuTemplateLabel(found.label);
        } else {
          setOnuTemplateLabel(val);
        }
        setPickerConfig((p) => ({ ...p, visible: false }));
      },
    });
  };

  const handleConfirmAuthorization = async () => {
    Keyboard.dismiss();
    setFormError(null);
    setFormSuccess(null);

    if (!selectedOlt || !selectedOnu) {
      setFormError('Selecione uma ONU não autorizada antes de prosseguir.');
      return;
    }

    const onuSerial = selectedOnu.id !== undefined && selectedOnu.id !== null ? String(selectedOnu.id) : (selectedOnu.serial || selectedOnu.mac || '');

    if (!contratoId.trim()) {
      setFormError('Selecione um cliente e contrato na Etapa 1 ou informe o Contrato ID.');
      return;
    }

    if (!servicoLogin.trim()) {
      setFormError('Informe o Login do Serviço (PPPoE).');
      return;
    }

    let modeCode = '2'; // Default PPPoE (2)
    if (modo.includes('Bridge') && !modo.includes('WAN')) modeCode = '1';
    else if (modo.includes('PPPoE') || modo.includes('2')) modeCode = '2';
    else if (modo.includes('WAN') || modo.includes('3')) modeCode = '3';
    else if (modo.includes('DHCP') || modo.includes('Router') || modo.includes('4')) modeCode = '4';

    setIsSubmitting(true);
    try {
      const res = await authorizeOnuSgp({
        olt_id: selectedOlt.id,
        slot: selectedOnu.slot ?? '0',
        pon: selectedOnu.pon ?? '1',
        id: onuSerial,
        onutype: onuTipo || '1',
        onutemplate: onuTemplateId || '1',
        mode: modeCode,
        service: servicoLogin,
        contrato: contratoId,
        description: descricao || `${selectedClient?.nome || 'Cliente'} - Contrato #${contratoId}`,
        vlan: vlan,
      });

      setIsSubmitting(false);

      if (res.status === 0) {
        setFormError(res.msg);
        return;
      }

      // FECHA O MODAL E NAVEGA DE VOLTA IMEDIATAMENTE CONFORME SOLICITADO
      setIsModalOpen(false);

      if (onBackToOs) {
        onBackToOs();
      }

      // EXIBE O ALERTA DE SUCESSO NATIVO
      Alert.alert(
        'ONU Autorizada com Sucesso! 🚀',
        `Equipamento ${onuSerial} provisionado na OLT ${selectedOlt.name}.\n\n` +
          `• Cliente: ${selectedClient?.nome || 'Cliente SGP'}\n` +
          `• Contrato: #${contratoId}\n` +
          `• Service Login: ${servicoLogin}\n` +
          `• Modo: ${modo} | VLAN: ${vlan || 'Padrão'}\n` +
          `• Tipo / Template: ${onuTipo} - ${onuTemplateLabel}`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      setIsSubmitting(false);
      setFormError(`Erro ao comunicar com o SGP: ${e.message || 'Falha de rede'}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <TouchableOpacity style={styles.backBtn} onPress={onBackToOs} activeOpacity={0.7}>
            <Feather name="arrow-left" size={20} color="#F8FAFC" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Autorizar ONU</Text>
            <Text style={styles.headerSubtitle}>
              {selectedOlt ? `OLT: ${selectedOlt.name}` : `${olts.length} OLTs cadastradas`}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={loadOlts} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="refresh-cw" size={18} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* CONTENT: SELEÇÃO DE OLT OU LISTA DE UNAUTH */}
      {isLoadingOlts ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Carregando OLTs cadastradas no SGP...</Text>
        </View>
      ) : !selectedOlt ? (
        <View style={{ flex: 1 }}>
          <View style={styles.sectionHeaderBox}>
            <Text style={styles.sectionTitle}>Selecione uma OLT para buscar ONUs não autorizadas:</Text>
          </View>

          <FlatList
            data={olts}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleSelectOlt(item)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.oltIconCircle}>
                    <Feather name="cpu" size={20} color="#38BDF8" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.oltName}>{item.name}</Text>
                    <Text style={styles.oltSub}>
                      {item.olttype || 'OLT SGP'} • Host: {item.host || '127.0.0.1'}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#64748B" />
                </View>

                <View style={styles.oltDetailsRow}>
                  <View style={styles.oltBadge}>
                    <Feather name="layers" size={12} color="#10B981" />
                    <Text style={styles.oltBadgeText}>{item.onu_count || 0} ONUs Cadastradas</Text>
                  </View>
                  {item.pon_count ? (
                    <View style={styles.oltBadge}>
                      <Feather name="activity" size={12} color="#F59E0B" />
                      <Text style={styles.oltBadgeText}>{item.pon_count} Portas PON</Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={styles.searchUnauthBtn}
                  onPress={() => handleSelectOlt(item)}
                  activeOpacity={0.8}
                >
                  <Feather name="search" size={14} color="#0F172A" />
                  <Text style={styles.searchUnauthBtnText}>Buscar ONUs Não Autorizadas</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* BARRA DA OLT SELECIONADA */}
          <View style={styles.selectedOltBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedOltName}>{selectedOlt.name}</Text>
              <Text style={styles.selectedOltSub}>{selectedOlt.olttype} • Host: {selectedOlt.host}</Text>
            </View>
            <TouchableOpacity
              style={styles.changeOltBtn}
              onPress={() => setSelectedOlt(null)}
              activeOpacity={0.7}
            >
              <Feather name="repeat" size={14} color="#38BDF8" />
              <Text style={styles.changeOltBtnText}>Trocar OLT</Text>
            </TouchableOpacity>
          </View>

          {/* LISTA DE ONUS NÃO AUTORIZADAS */}
          {isLoadingUnauth ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.loadingText}>Escaneando ONUs não autorizadas na OLT...</Text>
            </View>
          ) : unauthOnus.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="check-circle" size={48} color="#10B981" />
              <Text style={styles.emptyTitle}>Nenhuma ONU Não Autorizada</Text>
              <Text style={styles.emptySub}>
                Todas as ONUs conectadas na {selectedOlt.name} já estão autorizadas no sistema.
              </Text>
              <TouchableOpacity
                style={styles.retrySearchBtn}
                onPress={() => handleSelectOlt(selectedOlt)}
                activeOpacity={0.8}
              >
                <Feather name="refresh-cw" size={14} color="#0F172A" />
                <Text style={styles.retrySearchBtnText}>Buscar Novamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={unauthOnus}
              keyExtractor={(item, index) => (item.id ? String(item.id) : item.serial || item.mac || index.toString())}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const onuSerialStr = item.id !== undefined && item.id !== null ? String(item.id) : (item.serial || item.mac || item.gpon_sn || 'ONU Sem Serial');

                return (
                  <View style={styles.unauthCard}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.unauthIconCircle}>
                        <Feather name="alert-triangle" size={18} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.unauthSerial}>
                          Serial ONU: {onuSerialStr}
                        </Text>
                        <Text style={styles.unauthSub}>
                          {item.vendor || 'SGP Vendor'} {item.type ? `• Tipo: ${item.type}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.unauthMetaRow}>
                      {item.slot || item.pon || item.port ? (
                        <Text style={styles.unauthMetaText}>
                          Porta: Slot {item.slot || '1'} / PON {item.pon || item.port || '1'}
                        </Text>
                      ) : null}
                      {item.rx !== undefined ? (
                        <Text style={styles.unauthMetaText}>Sinal RX: {item.rx} dBm</Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={styles.authorizeBtn}
                      onPress={() => handleStartAuthorize(item)}
                      activeOpacity={0.8}
                    >
                      <Feather name="check" size={16} color="#0F172A" />
                      <Text style={styles.authorizeBtnText}>Autorizar Esta ONU</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* MODAL PRINCIPAL DE PROVISIONAMENTO COM KEYBOARD AVOIDING VIEW */}
      <Modal
        visible={isModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          if (pickerConfig.visible) {
            setPickerConfig((p) => ({ ...p, visible: false }));
          } else {
            setIsModalOpen(false);
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            {/* OVERLAY DE SELEÇÃO EM LISTA SGP (QUANDO ABERTO) */}
            {pickerConfig.visible ? (
              <View style={styles.inlinePickerBox}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>{pickerConfig.title}</Text>
                  <TouchableOpacity
                    onPress={() => setPickerConfig((p) => ({ ...p, visible: false }))}
                    style={{ padding: 6 }}
                  >
                    <Feather name="x" size={22} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={{ maxHeight: 360 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {pickerConfig.options.map((opt) => {
                    const isSelected = opt === pickerConfig.currentValue;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.pickerOptionRow, isSelected && styles.pickerOptionRowActive]}
                        onPress={() => pickerConfig.onSelect(opt)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive]}>
                          {opt}
                        </Text>
                        {isSelected ? <Feather name="check" size={20} color="#38BDF8" /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <>
                {/* MODAL HEADER */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Autorizar ONU na OLT</Text>
                    <Text style={styles.modalSubTitle}>
                      Serial: {selectedOnu?.id !== undefined && selectedOnu?.id !== null ? String(selectedOnu.id) : selectedOnu?.serial}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setIsModalOpen(false)} style={{ padding: 6 }}>
                    <Feather name="x" size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* BANNER DE NOTIFICAÇÃO DE ERRO OU SUCESSO DENTRO DO MODAL */}
                {formError ? (
                  <View style={styles.errorBanner}>
                    <Feather name="alert-circle" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={styles.errorBannerText}>{formError}</Text>
                  </View>
                ) : null}

                {formSuccess ? (
                  <View style={styles.successBanner}>
                    <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={styles.successBannerText}>{formSuccess}</Text>
                  </View>
                ) : null}

                {/* WIZARD STEPS INDICATOR */}
                <View style={styles.stepsRow}>
                  <TouchableOpacity
                    style={[styles.stepItem, wizardStep === 1 && styles.stepItemActive]}
                    onPress={() => {
                      setFormError(null);
                      setWizardStep(1);
                    }}
                  >
                    <Text style={[styles.stepNumber, wizardStep === 1 && styles.stepNumberActive]}>1</Text>
                    <Text style={[styles.stepText, wizardStep === 1 && styles.stepTextActive]}>Buscar Cliente</Text>
                  </TouchableOpacity>

                  <View style={styles.stepDivider} />

                  <TouchableOpacity
                    style={[styles.stepItem, wizardStep === 2 && styles.stepItemActive]}
                    onPress={() => {
                      if (contratoId) {
                        setFormError(null);
                        setWizardStep(2);
                      } else {
                        setFormError('Selecione um contrato na Etapa 1 antes de avançar.');
                      }
                    }}
                  >
                    <Text style={[styles.stepNumber, wizardStep === 2 && styles.stepNumberActive]}>2</Text>
                    <Text style={[styles.stepText, wizardStep === 2 && styles.stepTextActive]}>Formulário SGP</Text>
                  </TouchableOpacity>
                </View>

                {/* ETAPA 1: BUSCAR CLIENTE E SELECIONAR CONTRATO */}
                {wizardStep === 1 ? (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ paddingBottom: 25 }}
                  >
                    <Text style={styles.stepInstruction}>
                      Digite o Nome ou CPF do cliente para encontrar os contratos vinculados:
                    </Text>

                    <View style={styles.modalSearchBox}>
                      <TextInput
                        style={styles.modalSearchInput}
                        placeholder="Nome ou CPF do cliente..."
                        placeholderTextColor="#64748B"
                        value={clientQuery}
                        onChangeText={(txt) => {
                          setClientQuery(txt);
                          if (formError) setFormError(null);
                        }}
                        onSubmitEditing={handleSearchClient}
                        returnKeyType="search"
                      />
                      <TouchableOpacity style={styles.modalSearchBtn} onPress={handleSearchClient} activeOpacity={0.8}>
                        <Text style={styles.modalSearchBtnText}>Buscar</Text>
                      </TouchableOpacity>
                    </View>

                    {isSearchingClient ? (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#38BDF8" />
                        <Text style={{ color: '#94A3B8', marginTop: 8, fontSize: 13 }}>Buscando contratos no SGP...</Text>
                      </View>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((client) => (
                        <View key={client.id} style={styles.clientResultCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="user" size={16} color="#38BDF8" style={{ marginRight: 8 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.clientResultName}>{client.nome}</Text>
                              {client.cpfcnpj ? (
                                <Text style={styles.clientResultCpf}>CPF: {client.cpfcnpj}</Text>
                              ) : null}
                            </View>
                          </View>

                          {/* CONTRATOS DO CLIENTE */}
                          {client.contratos && client.contratos.length > 0 ? (
                            <View style={{ marginTop: 10 }}>
                              <Text style={styles.contractsHeaderLabel}>Selecione um contrato:</Text>
                              {client.contratos.map((c) => {
                                const servico = c.servicos?.[0];
                                const loginStr = servico?.login || c.contratoCentralLogin || 'Sem PPPoE';
                                const isSelected = selectedContract?.id === c.id;

                                return (
                                  <TouchableOpacity
                                    key={c.id}
                                    style={[styles.contractSelectCard, isSelected && styles.contractSelectCardActive]}
                                    onPress={() => handleSelectClientContract(client, c)}
                                    activeOpacity={0.8}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.contractSelectTitle}>Contrato #{c.id}</Text>
                                      <Text style={styles.contractSelectSub}>PPPoE: {loginStr}</Text>
                                      {servico?.plano?.descricao || c.plano ? (
                                        <Text style={styles.contractSelectPlan}>
                                          Plano: {servico?.plano?.descricao || c.plano}
                                        </Text>
                                      ) : null}
                                    </View>

                                    <View style={styles.selectBtnBadge}>
                                      <Text style={styles.selectBtnBadgeText}>Selecionar</Text>
                                      <Feather name="chevron-right" size={14} color="#0F172A" />
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                        <Feather name="user-check" size={36} color="#334155" />
                        <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13, textAlign: 'center' }}>
                          Pesquise pelo nome ou CPF do cliente acima para exibir e selecionar os contratos.
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                ) : (
                  /* ETAPA 2: FORMULÁRIO DE PROVISIONAMENTO DA ONU COM SELEÇÃO EM LISTA SGP */
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ paddingBottom: 35 }}
                  >
                    {/* DADOS AUTO-PREENCHIDOS */}
                    <View style={styles.autoFilledBox}>
                      <Text style={styles.autoFilledTitle}>✅ Cliente e Contrato Selecionados:</Text>
                      <Text style={styles.autoFilledText}>• Cliente: {selectedClient?.nome || 'Cliente Selecionado'}</Text>
                      <Text style={styles.autoFilledText}>• Contrato ID: #{contratoId}</Text>
                      <Text style={styles.autoFilledText}>• Login PPPoE: {servicoLogin}</Text>
                    </View>

                    {/* CAMPO CONTRATO ID */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Contrato ID</Text>
                      <TextInput
                        style={styles.formInput}
                        value={contratoId}
                        onChangeText={(txt) => {
                          setContratoId(txt);
                          if (formError) setFormError(null);
                        }}
                        placeholder="ID do contrato..."
                        placeholderTextColor="#64748B"
                        keyboardType="number-pad"
                      />
                    </View>

                    {/* CAMPO SERVICE LOGIN */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Service Login</Text>
                      <TextInput
                        style={styles.formInput}
                        value={servicoLogin}
                        onChangeText={(txt) => {
                          setServicoLogin(txt);
                          if (formError) setFormError(null);
                        }}
                        placeholder="Login PPPoE..."
                        placeholderTextColor="#64748B"
                        autoCapitalize="none"
                      />
                    </View>

                    {/* MODO DE OPERAÇÃO */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Modo de Operação</Text>
                      <TouchableOpacity style={styles.selectListInput} onPress={openModoPicker} activeOpacity={0.8}>
                        <Text style={styles.selectListValue}>{modo}</Text>
                        <Feather name="chevron-down" size={18} color="#38BDF8" />
                      </TouchableOpacity>
                    </View>

                    {/* ONU TIPO */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>ONU Tipo</Text>
                      <TouchableOpacity style={styles.selectListInput} onPress={openOnuTipoPicker} activeOpacity={0.8}>
                        <Text style={styles.selectListValue}>{onuTipo}</Text>
                        <Feather name="chevron-down" size={18} color="#38BDF8" />
                      </TouchableOpacity>
                    </View>

                    {/* ONU TEMPLATE */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>ONU Template</Text>
                      <TouchableOpacity style={styles.selectListInput} onPress={openOnuTemplatePicker} activeOpacity={0.8}>
                        <Text style={styles.selectListValue}>{onuTemplateLabel}</Text>
                        <Feather name="chevron-down" size={18} color="#38BDF8" />
                      </TouchableOpacity>
                    </View>

                    {/* VLAN */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>VLAN ID</Text>
                      <TextInput
                        style={styles.formInput}
                        value={vlan}
                        onChangeText={(txt) => {
                          setVlan(txt);
                          if (formError) setFormError(null);
                        }}
                        placeholder="Informe a VLAN..."
                        placeholderTextColor="#64748B"
                        keyboardType="number-pad"
                      />
                    </View>

                    {/* DESCRIÇÃO */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Descrição da ONU</Text>
                      <TextInput
                        style={styles.formInput}
                        value={descricao}
                        onChangeText={(txt) => {
                          setDescricao(txt);
                          if (formError) setFormError(null);
                        }}
                        placeholder="Descrição da ONU..."
                        placeholderTextColor="#64748B"
                      />
                    </View>

                    {/* BOTÃO CONFIRMAR PROVISIONAMENTO */}
                    <TouchableOpacity
                      style={styles.submitBtn}
                      onPress={handleConfirmAuthorization}
                      disabled={isSubmitting}
                      activeOpacity={0.8}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#0F172A" />
                      ) : (
                        <>
                          <Feather name="check-circle" size={18} color="#0F172A" />
                          <Text style={styles.submitBtnText}>Confirmar Autorização na OLT</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
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
  sectionHeaderBox: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
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
  oltIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  oltName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  oltSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  oltDetailsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  oltBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  oltBadgeText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 5,
  },
  searchUnauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    borderRadius: 10,
    paddingVertical: 9,
    marginTop: 12,
  },
  searchUnauthBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 6,
  },
  selectedOltBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111726',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  selectedOltName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  selectedOltSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  changeOltBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeOltBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
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
    lineHeight: 18,
  },
  retrySearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 18,
  },
  retrySearchBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 6,
  },
  unauthCard: {
    backgroundColor: '#111726',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  unauthIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unauthSerial: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  unauthSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  unauthMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#161F30',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  unauthMetaText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  authorizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 10,
  },
  authorizeBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 6,
  },
  modalKeyboardAvoiding: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0B0F17',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '92%',
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
    marginBottom: 10,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorBannerText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  successBannerText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111726',
    borderRadius: 12,
    padding: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  stepItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  stepItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#161F30',
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 20,
    marginRight: 6,
  },
  stepNumberActive: {
    backgroundColor: '#38BDF8',
    color: '#0F172A',
  },
  stepText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  stepTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  stepDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#1E293B',
  },
  stepInstruction: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 10,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalSearchInput: {
    flex: 1,
    height: 42,
    color: '#F8FAFC',
    fontSize: 13,
  },
  modalSearchBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modalSearchBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 12,
  },
  clientResultCard: {
    backgroundColor: '#111726',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  clientResultName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  clientResultCpf: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  contractsHeaderLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  contractSelectCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  contractSelectCardActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  contractSelectTitle: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 13,
  },
  contractSelectSub: {
    color: '#38BDF8',
    fontSize: 11,
    marginTop: 2,
  },
  contractSelectPlan: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  selectBtnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectBtnBadgeText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 11,
    marginRight: 4,
  },
  autoFilledBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  autoFilledTitle: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  autoFilledText: {
    color: '#F8FAFC',
    fontSize: 12,
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#161F30',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  selectListInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  selectListValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 12,
  },
  submitBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
  },
  inlinePickerBox: {
    paddingBottom: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    marginBottom: 10,
  },
  pickerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pickerOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#161F30',
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  pickerOptionRowActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  pickerOptionText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '500',
  },
  pickerOptionTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
});
