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
} from 'react-native';
import { UraClienteItem, searchClientesSgp } from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onBackToOs: () => void;
}

export const ClientSearchScreen: React.FC<Props> = ({ onBackToOs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [clientes, setClientes] = useState<UraClienteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handlePerformSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      const results = await searchClientesSgp(q);
      setClientes(results);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
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
              const isAtivo = (c.status || '').toLowerCase().includes('ativo');
              return (
                <View key={c.id} style={styles.contractBadgeCard}>
                  <View style={styles.contractBadgeHeader}>
                    <Text style={styles.contractIdText}>Contrato #{c.id}</Text>
                    <View style={[styles.statusBadgeDot, { backgroundColor: isAtivo ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                      <View style={[styles.dotIndicator, { backgroundColor: isAtivo ? '#10B981' : '#EF4444' }]} />
                      <Text style={[styles.statusBadgeDotText, { color: isAtivo ? '#10B981' : '#EF4444' }]}>
                        {c.status || 'Ativo'}
                      </Text>
                    </View>
                  </View>

                  {c.plano ? (
                    <Text style={styles.planText}>Plano: {c.plano}</Text>
                  ) : null}

                  {c.vencimento ? (
                    <Text style={styles.vencimentotext}>Vencimento: Dia {c.vencimento}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
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
            <Feather name="x" size={16} color="#64748B" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.searchSubmitBtn}
          onPress={handlePerformSearch}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#0F172A" />
          ) : (
            <Text style={styles.searchSubmitBtnText}>Buscar</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* BODY CONTENT */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Consultando clientes no SGP...</Text>
        </View>
      ) : !hasSearched ? (
        <View style={styles.placeholderContainer}>
          <View style={styles.placeholderIconCircle}>
            <Feather name="search" size={36} color="#38BDF8" />
          </View>
          <Text style={styles.placeholderTitle}>Pesquisar Clientes no SGP</Text>
          <Text style={styles.placeholderSub}>
            Digite o nome do cliente na barra de pesquisa acima e clique em "Buscar" para visualizar o cadastro, contratos e telefones.
          </Text>
        </View>
      ) : clientes.length === 0 ? (
        <View style={styles.placeholderContainer}>
          <Feather name="user-x" size={40} color="#64748B" />
          <Text style={styles.placeholderTitle}>Nenhum cliente encontrado</Text>
          <Text style={styles.placeholderSub}>
            Não encontramos nenhum cliente com o nome "{searchQuery}". Verifique a digitação e tente novamente.
          </Text>
        </View>
      ) : (
        <FlatList
          data={clientes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderClienteCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
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
    fontSize: 14,
  },
  searchSubmitBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 8,
  },
  searchSubmitBtnText: {
    color: '#0F172A',
    fontWeight: '700',
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
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  placeholderIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#161F30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  placeholderTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderSub: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontWeight: '700',
  },
  clientCpf: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  addressBox: {
    backgroundColor: '#161F30',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    color: '#E2E8F0',
    fontSize: 12,
    flex: 1,
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
    backgroundColor: '#161F30',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  contactChipText: {
    color: '#94A3B8',
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
    fontWeight: '700',
    marginBottom: 6,
  },
  contractBadgeCard: {
    backgroundColor: '#161F30',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  contractBadgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contractIdText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
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
    marginRight: 6,
  },
  statusBadgeDotText: {
    fontSize: 10,
    fontWeight: '700',
  },
  planText: {
    color: '#38BDF8',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  vencimentotext: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
});
