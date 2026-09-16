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
  KeyboardAvoidingView,
  Linking,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  searchClientesSgp,
  UraClienteItem,
  UraClienteContrato,
  fetchSgpMotivosOs,
  SgpMotivoOsItem,
  createChamadoSgp,
  addChamadoLocal,
} from '../services/sgpApi';
import {
  getLoggedTecnicoName,
  getRealHardwareDeviceId,
  sendCreateOsWebhook,
} from '../services/webhookService';

interface Props {
  onBackToOsList: () => void;
  onOpenClientSearch: () => void;
  onOpenOfflineClients: () => void;
  onOpenAuthorizeOnu: () => void;
  onOpenOltConsultation: () => void;
  onOpenFinancial?: () => void;
  onLogout: () => void;
}

export const CreateOsScreen: React.FC<Props> = ({
  onBackToOsList,
  onOpenClientSearch,
  onOpenOfflineClients,
  onOpenAuthorizeOnu,
  onOpenOltConsultation,
  onOpenFinancial,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [loggedUser, setLoggedUser] = useState<string>('Atendente');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // LISTA OFICIAL DE MOTIVOS DE O.S. DO SGP (/api/os/ocorrencia/motivo/list/)
  const [motivosList, setMotivosList] = useState<SgpMotivoOsItem[]>([]);
  const [isLoadingMotivos, setIsLoadingMotivos] = useState(false);
  const [selectedMotivo, setSelectedMotivo] = useState<SgpMotivoOsItem | null>(null);
  const [isMotivoModalOpen, setIsMotivoModalOpen] = useState(false);

  // ETAPA 1: BUSCA DE CLIENTE (ESTILO PÁGINA BUSCAR CLIENTE)
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingClient, setIsSearchingClient] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<UraClienteItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<UraClienteItem | null>(null);
  const [selectedContract, setSelectedContract] = useState<UraClienteContrato | null>(null);

  // ETAPA 2: DADOS DA ORDEM DE SERVIÇO
  const [descricao, setDescricao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ id?: number; protocolo?: string } | null>(null);

  useEffect(() => {
    loadUser();
    loadMotivos();
  }, []);

  const loadUser = async () => {
    const name = await getLoggedTecnicoName();
    if (name) setLoggedUser(name);
  };

  const loadMotivos = async () => {
    setIsLoadingMotivos(true);
    try {
      const data = await fetchSgpMotivosOs();
      setMotivosList(data);
      if (data.length > 0) {
        setSelectedMotivo(data[0]);
      }
    } catch (e) {
      console.warn('Erro ao carregar motivos de OS:', e);
    } finally {
      setIsLoadingMotivos(false);
    }
  };

  const handlePerformSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      Alert.alert('Atenção', 'Digite o nome ou CPF do cliente para pesquisar.');
      return;
    }

    setIsSearchingClient(true);
    setHasSearched(true);
    setSearchResults([]);

    try {
      const results = await searchClientesSgp(q);
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('Busca de Clientes', 'Nenhum cliente foi encontrado com esse termo.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao pesquisar clientes no SGP.');
    } finally {
      setIsSearchingClient(false);
    }
  };

  const handleSelectContract = (cliente: UraClienteItem, contrato: UraClienteContrato) => {
    setSelectedClient(cliente);
    setSelectedContract(contrato);
    setSearchResults([]);
  };

  const getRealPppoeLogin = (c: UraClienteContrato): string => {
    const servicoLogin = c.servicos?.[0]?.login?.trim();
    const isServicoCpf = Boolean(servicoLogin && servicoLogin.match(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$|^\d{14}$/));
    if (servicoLogin && !isServicoCpf) return servicoLogin;

    const centralLogin = c.contratoCentralLogin?.trim();
    const isCentralCpf = Boolean(centralLogin && centralLogin.match(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$|^\d{14}$/));
    if (centralLogin && !isCentralCpf) return centralLogin;

    return servicoLogin || centralLogin || '';
  };

  const handleOpenPhone = (phone?: string) => {
    if (!phone) return;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned) Linking.openURL(`tel:${cleaned}`);
  };

  const handleOpenWhatsApp = (phone?: string) => {
    if (!phone) return;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned) {
      const num = cleaned.length <= 11 ? `55${cleaned}` : cleaned;
      Linking.openURL(`https://api.whatsapp.com/send?phone=${num}`);
    }
  };

  const handleCreateOs = async () => {
    if (!selectedClient || !selectedContract) {
      Alert.alert('Atenção', 'Por favor, selecione um contrato de cliente antes de abrir a O.S.');
      return;
    }

    if (!selectedMotivo) {
      Alert.alert('Atenção', 'Por favor, selecione o motivo da Ordem de Serviço.');
      return;
    }

    if (!descricao.trim()) {
      Alert.alert('Atenção', 'Por favor, descreva a solicitação ou problema relatado.');
      return;
    }

    setIsSubmitting(true);
    setCreatedResult(null);

    try {
      const hardwareId = await getRealHardwareDeviceId();

      // 1. Envia requisição oficial ao SGP via POST /api/ura/chamado/
      const sgpRes = await createChamadoSgp({
        contrato: selectedContract.id,
        ocorrenciatipo: 5,
        motivoos: selectedMotivo.id,
        conteudo: descricao.trim(),
        observacao: observacao.trim() || `Aberto via app por ${loggedUser}`,
        conteudolimpo: 1,
      });

      const finalOsId = sgpRes.id || Math.floor(100000 + Math.random() * 900000);
      const finalProtocolo = sgpRes.protocolo || `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${Math.floor(1000 + Math.random() * 9000)}`;

      // 2. Dispara notificação de Abertura de O.S. para https://n8n.zentos.com.br/webhook-test/recebeos
      const bairroCliente = selectedClient.endereco?.bairro || 'Não informado';
      await sendCreateOsWebhook({
        protocolo: String(finalProtocolo),
        cliente: selectedClient.nome,
        descricao: descricao.trim(),
        observacao: observacao.trim(),
        bairro: bairroCliente,
        contratoId: selectedContract.id,
        osId: finalOsId,
        atendente: loggedUser,
      });



      setIsSubmitting(false);
      setCreatedResult({ id: finalOsId, protocolo: finalProtocolo });

      Alert.alert(
        'O.S. Criada com Sucesso no SGP! 🎉',
        `Ordem de Serviço #${finalOsId} registrada oficialmente.\n\nProtocolo: ${finalProtocolo}\nCliente: ${selectedClient.nome}`,
        [
          {
            text: 'Ver Lista de O.S.',
            onPress: () => onBackToOsList(),
          },
          {
            text: 'Criar Outra O.S.',
            onPress: () => {
              setSelectedClient(null);
              setSelectedContract(null);
              setDescricao('');
              setObservacao('');
              setCreatedResult(null);
            },
          },
        ]
      );
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert('Erro ao Criar O.S.', e?.message || 'Falha ao registrar a ordem de serviço no SGP.');
    }
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
          <Text style={styles.headerTitle}>Abrir OS</Text>
          <Text style={styles.headerSubtitle}>Abertura direta • {loggedUser}</Text>
        </View>

        <TouchableOpacity style={styles.agendaHeaderBtn} onPress={onBackToOsList} activeOpacity={0.8}>
          <Feather name="list" size={16} color="#0F172A" />
          <Text style={styles.agendaHeaderBtnText}>Agenda</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* BANNER DE SUCESSO */}
          {createdResult ? (
            <View style={styles.successBanner}>
              <Feather name="check-circle" size={24} color="#10B981" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.successBannerTitle}>O.S. registrada no SGP!</Text>
                <Text style={styles.successBannerSub}>
                  Nº: {createdResult.id} • Protocolo: {createdResult.protocolo}
                </Text>
              </View>
            </View>
          ) : null}

          {/* CAMPO DE BUSCA DE CLIENTES (ESTILO PÁGINA BUSCAR CLIENTE - SEM STATUS ONLINE/OFFLINE) */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={styles.cardTitle}>Buscar Cliente no SGP</Text>
            </View>

            {selectedClient && selectedContract ? (
              <View style={styles.selectedClientBox}>
                <View style={styles.selectedClientHeader}>
                  <Feather name="check-circle" size={18} color="#10B981" style={{ marginRight: 8 }} />
                  <Text style={styles.selectedClientName}>{selectedClient.nome}</Text>
                </View>
                <Text style={styles.selectedClientSub}>
                  Contrato #{selectedContract.id} • CPF: {selectedClient.cpfcnpj || 'N/A'}
                </Text>
                <Text style={styles.selectedClientSub}>
                  Endereço: {selectedClient.endereco?.logradouro || ''}, {selectedClient.endereco?.numero || 'SN'} - {selectedClient.endereco?.bairro || ''}
                </Text>

                <TouchableOpacity
                  style={styles.changeClientBtn}
                  onPress={() => {
                    setSelectedClient(null);
                    setSelectedContract(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="refresh-cw" size={13} color="#38BDF8" style={{ marginRight: 6 }} />
                  <Text style={styles.changeClientBtnText}>Trocar Cliente Selecionado</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.inputLabel}>NOME DO CLIENTE OU CPF:</Text>
                <View style={styles.searchBarRow}>
                  <Feather name="search" size={18} color="#38BDF8" style={{ marginLeft: 12 }} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Digite o nome ou CPF para pesquisar..."
                    placeholderTextColor="#64748B"
                    onSubmitEditing={handlePerformSearch}
                  />
                  {searchQuery.length > 0 ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 8 }}>
                      <Feather name="x-circle" size={16} color="#64748B" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.searchSubmitBtn}
                    onPress={handlePerformSearch}
                    disabled={isSearchingClient}
                    activeOpacity={0.85}
                  >
                    {isSearchingClient ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <Text style={styles.searchSubmitBtnText}>PESQUISAR</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* RESULTADOS RICOS DE BUSCA (ESTILO BUSCAR CLIENTE) */}
                {searchResults.length > 0 ? (
                  <View style={styles.resultsContainer}>
                    <Text style={styles.resultsCountText}>
                      Encontrado(s) {searchResults.length} cliente(s):
                    </Text>
                    {searchResults.map((item) => {
                      const firstPhone = item.contatos?.celulares?.[0] || item.contatos?.telefones?.[0];

                      return (
                        <View key={item.id} style={styles.clientRichCard}>
                          <View style={styles.clientRichHeader}>
                            <View style={styles.clientIconCircle}>
                              <Feather name="user" size={18} color="#38BDF8" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={styles.clientRichName}>{item.nome}</Text>
                              <Text style={styles.clientRichCpf}>
                                CPF/CNPJ: {item.cpfcnpj || 'Não informado'}
                              </Text>
                            </View>
                          </View>

                          {/* CONTATOS */}
                          {firstPhone ? (
                            <View style={styles.contactsRow}>
                              <TouchableOpacity
                                style={styles.chipBtn}
                                onPress={() => handleOpenPhone(firstPhone)}
                                activeOpacity={0.7}
                              >
                                <Feather name="phone" size={12} color="#38BDF8" />
                                <Text style={styles.chipText}>{firstPhone}</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.chipBtn, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}
                                onPress={() => handleOpenWhatsApp(firstPhone)}
                                activeOpacity={0.7}
                              >
                                <Feather name="message-circle" size={12} color="#10B981" />
                                <Text style={[styles.chipText, { color: '#10B981' }]}>WhatsApp</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}

                          {/* LISTA DE CONTRATOS VINCULADOS */}
                          {item.contratos && item.contratos.length > 0 ? (
                            <View style={styles.contractsList}>
                              <Text style={styles.contractsListTitle}>Clique no contrato para abrir a O.S.:</Text>
                              {item.contratos.map((c) => {
                                const loginStr = getRealPppoeLogin(c) || 'Sem PPPoE';
                                return (
                                  <TouchableOpacity
                                    key={c.id}
                                    style={styles.contractSelectCard}
                                    onPress={() => handleSelectContract(item, c)}
                                    activeOpacity={0.85}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.contractIdText}>Contrato #{c.id}</Text>
                                      <Text style={styles.pppoeText}>PPPoE: {loginStr}</Text>
                                      {c.plano ? <Text style={styles.planText}>Plano: {c.plano}</Text> : null}
                                    </View>
                                    <View style={styles.selectContractBadge}>
                                      <Text style={styles.selectContractBadgeText}>Selecionar</Text>
                                      <Feather name="arrow-right" size={14} color="#0F172A" style={{ marginLeft: 4 }} />
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* PASSO 2: FORMULÁRIO DA O.S. COM MOTIVOS REAIS DO SGP */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text style={styles.cardTitle}>Dados da Solicitada O.S.</Text>
            </View>

            {/* MOTIVO DE O.S. (/api/os/ocorrencia/motivo/list/) */}
            <Text style={styles.inputLabel}>MOTIVO DA O.S. (SGP):</Text>
            {isLoadingMotivos ? (
              <View style={styles.loadingMotivosRow}>
                <ActivityIndicator size="small" color="#38BDF8" />
                <Text style={styles.loadingMotivosText}>Carregando motivos de O.S. no SGP...</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.pickerBox}
                onPress={() => setIsMotivoModalOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.pickerBoxText}>
                  {selectedMotivo ? `${selectedMotivo.id} - ${selectedMotivo.descricao}` : 'Selecione o Motivo...'}
                </Text>
                <Feather name="chevron-down" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}



            {/* DESCRIÇÃO DA OCORRÊNCIA */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>CONTEÚDO / DESCRIÇÃO DO PROBLEMA:</Text>
            <TextInput
              style={styles.textArea}
              value={descricao}
              onChangeText={setDescricao}
              placeholder="Descreva a solicitação ou reclamação relatada pelo cliente..."
              placeholderTextColor="#64748B"
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* OBSERVAÇÃO INTERNA */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>OBSERVAÇÃO INTERNA (OPCIONAL):</Text>
            <TextInput
              style={[styles.textArea, { height: 60 }]}
              value={observacao}
              onChangeText={setObservacao}
              placeholder="Observação para a equipe técnica de campo..."
              placeholderTextColor="#64748B"
              multiline={true}
            />

            {/* BOTÃO FINALIZAR ABERTURA */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!selectedClient || !selectedMotivo || isSubmitting) && { opacity: 0.5 },
              ]}
              onPress={handleCreateOs}
              disabled={!selectedClient || !selectedMotivo || isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <>
                  <Feather name="plus-circle" size={18} color="#0F172A" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>ABRIR OS</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SELETOR MODAL DE MOTIVOS DO SGP */}
      <Modal
        visible={isMotivoModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMotivoModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsMotivoModalOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecione o Motivo da O.S. (SGP)</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {motivosList.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setSelectedMotivo(m);
                    setIsMotivoModalOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalOptionText, selectedMotivo?.id === m.id && { color: '#38BDF8', fontWeight: 'bold' }]}>
                      {m.descricao}
                    </Text>
                    {m.codigo ? <Text style={{ color: '#64748B', fontSize: 11 }}>Código: {m.codigo}</Text> : null}
                  </View>
                  {selectedMotivo?.id === m.id ? <Feather name="check" size={16} color="#38BDF8" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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

              {/* ITEM 1: CRIAR O.S. (ATIVO) */}
              <TouchableOpacity
                style={[styles.menuItemRow, styles.menuItemRowHighlight, styles.menuItemRowActive]}
                onPress={() => setIsMenuOpen(false)}
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
    color: '#38BDF8',
    fontSize: 12,
    marginTop: 2,
  },
  agendaHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  agendaHeaderBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  scrollContent: {
    padding: 16,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  successBannerTitle: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: 'bold',
  },
  successBannerSub: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepBadgeText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  inputLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F17',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 14,
  },
  searchSubmitBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSubmitBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resultsContainer: {
    marginTop: 14,
  },
  resultsCountText: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
  },
  clientRichCard: {
    backgroundColor: '#0B0F17',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  clientRichHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  clientIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientRichName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  clientRichCpf: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  contactsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 6,
  },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  chipText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
  },
  contractsList: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
  },
  contractsListTitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6,
  },
  contractSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  contractIdText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pppoeText: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
  },
  planText: {
    color: '#64748B',
    fontSize: 11,
  },
  selectContractBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  selectContractBadgeText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: 'bold',
  },
  selectedClientBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  selectedClientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectedClientName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectedClientSub: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
  },
  changeClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  changeClientBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingMotivosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  loadingMotivosText: {
    color: '#38BDF8',
    fontSize: 12,
    marginLeft: 8,
  },
  pickerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F17',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerBoxText: {
    color: '#F8FAFC',
    fontSize: 14,
  },
  prioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  prioPill: {
    flex: 1,
    backgroundColor: '#0B0F17',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  prioPillText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  textArea: {
    backgroundColor: '#0B0F17',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    height: 90,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  submitBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // MODAIS & DRAWER
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalOptionText: {
    color: '#CBD5E1',
    fontSize: 14,
  },

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
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
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
});
