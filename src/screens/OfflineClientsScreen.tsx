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
  ScrollView,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { OfflineClienteDetailedItem, fetchAllClientesOfflineSgp } from '../services/sgpApi';
import { Feather } from '@expo/vector-icons';

interface Props {
  onBackToOs: () => void;
}

export const OfflineClientsScreen: React.FC<Props> = ({ onBackToOs }) => {
  const [clientesOffline, setClientesOffline] = useState<OfflineClienteDetailedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBairro, setSelectedBairro] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllClientesOfflineSgp();
      setClientesOffline(data);
    } catch (e) {
      setClientesOffline([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Coleta a lista de bairros únicos ordenados em ordem crescente (A-Z)
  const bairrosList = useMemo(() => {
    const map = new Map<string, number>();
    clientesOffline.forEach((item) => {
      const b = (item.bairroCanonico || 'OUTROS').trim().toUpperCase();
      map.set(b, (map.get(b) || 0) + 1);
    });

    const arr = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    // Ordem crescente por bairro (A-Z)
    arr.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return [{ name: 'TODOS', count: clientesOffline.length }, ...arr];
  }, [clientesOffline]);

  // Filtra por bairro e termo de busca, ordenado em ordem crescente por bairro (A-Z)
  const filteredList = useMemo(() => {
    const filtered = clientesOffline.filter((item) => {
      if (selectedBairro !== 'TODOS') {
        const itemBairro = (item.bairroCanonico || '').trim().toUpperCase();
        if (itemBairro !== selectedBairro) return false;
      }

      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.nome.toLowerCase().includes(q);
        const bairroMatch = (item.endereco_bairro || '').toLowerCase().includes(q) || item.bairroCanonico.toLowerCase().includes(q);
        const logrMatch = (item.endereco_logradouro || '').toLowerCase().includes(q);
        const pppoeMatch = (item.pppoe_login || '').toLowerCase().includes(q);

        if (!nameMatch && !bairroMatch && !logrMatch && !pppoeMatch) {
          return false;
        }
      }

      return true;
    });

    // Ordena em Ordem Crescente por Bairro (A-Z), e secundariamente por Nome do Cliente (A-Z)
    return filtered.sort((a, b) => {
      const bairroCompare = a.bairroCanonico.localeCompare(b.bairroCanonico, 'pt-BR');
      if (bairroCompare !== 0) return bairroCompare;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [clientesOffline, selectedBairro, searchQuery]);

  // Gera o HTML do mapa Leaflet interativo com pinos vermelhos para cada cliente offline
  const generateMapHtml = useMemo(() => {
    const markers = filteredList
      .filter((item) => item.hasExactCoords && item.latitude !== undefined && item.longitude !== undefined)
      .map((item) => ({
        id: item.servico_id || item.nome,
        nome: (item.nome || 'Cliente SGP').replace(/'/g, "\\'"),
        status: (item.statusContrato || 'Ativo').toUpperCase().replace(/'/g, "\\'"),
        endereco: (item.endereco_logradouro || item.endereco_bairro || item.bairroCanonico || '').replace(/'/g, "\\'"),
        login: (item.pppoe_login || '').replace(/'/g, "\\'"),
        lat: item.latitude!,
        lng: item.longitude!,
        exact: 'Coordenadas Cadastradas SGP',
      }));

    const centerLat = markers.length > 0 ? markers[0].lat : -7.8771171;
    const centerLng = markers.length > 0 ? markers[0].lng : -35.8609273;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #0B0F17; }
    .leaflet-popup-content-wrapper { background: #111726 !important; color: #F8FAFC !important; border-radius: 12px; border: 1px solid #EF4444; padding: 4px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    .leaflet-popup-tip { background: #111726 !important; }
    .client-popup-title { font-weight: bold; font-size: 13px; color: #F8FAFC; margin-bottom: 4px; }
    .client-popup-sub { font-size: 11px; color: #94A3B8; margin-bottom: 4px; }
    .client-popup-badge { display: inline-block; background: rgba(239,68,68,0.2); color: #EF4444; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 6px; margin-bottom: 6px; border: 1px solid rgba(239,68,68,0.4); }
    .gps-btn { display: block; width: 100%; text-align: center; background: #EF4444; color: #FFFFFF !important; font-weight: bold; font-size: 11px; padding: 6px 0; border-radius: 6px; text-decoration: none; margin-top: 6px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([${centerLat}, ${centerLng}], 13);
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '&copy; Google Maps'
    }).addTo(map);

    var markersData = ${JSON.stringify(markers)};
    var bounds = [];

    markersData.forEach(function(c) {
      if (c.lat && c.lng) {
        bounds.push([c.lat, c.lng]);
        
        var redIcon = L.divIcon({
          className: 'custom-red-pin',
          html: '<div style="background-color:#EF4444;width:24px;height:24px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 0 10px rgba(239,68,68,0.9);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">📍</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        var marker = L.marker([c.lat, c.lng], { icon: redIcon }).addTo(map);
        
        var popupHtml = '<div class="client-popup-title">🔴 ' + c.nome + '</div>' +
          '<div class="client-popup-badge">OFFLINE • ' + c.status + '</div>' +
          '<div class="client-popup-sub">📍 ' + c.endereco + '</div>' +
          (c.login ? '<div class="client-popup-sub">👤 PPPoE: ' + c.login + '</div>' : '') +
          '<div class="client-popup-sub" style="color:#64748B;font-size:10px;">🎯 ' + c.exact + '</div>' +
          '<a class="gps-btn" href="https://www.google.com/maps/dir/?api=1&destination=' + c.lat + ',' + c.lng + '" target="_blank">🧭 NAVEGAR NO GPS</a>';
        
        marker.bindPopup(popupHtml);
      }
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  </script>
</body>
</html>
    `;
  }, [filteredList]);

  const renderItem = ({ item }: { item: OfflineClienteDetailedItem }) => {
    const isSuspenso = item.statusContrato.toLowerCase().includes('suspenso') || item.statusContrato.toLowerCase().includes('cancelad');
    const isAtivo = item.statusContrato.toLowerCase().includes('ativo');

    const lastDisconnectRaw = item.acctstoptime || item.radacct?.[0]?.acctstoptime;
    let lastDisconnectFormatted = '';

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

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.clientIconCircle}>
            <Feather name="wifi-off" size={18} color={isSuspenso ? '#EF4444' : '#F59E0B'} />
          </View>
          <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
            <Text style={styles.clientName}>{item.nome}</Text>
            <Text style={styles.clientSub}>
              {item.endereco_logradouro || 'Sem Logradouro'} • Bairro: {item.bairroCanonico}
            </Text>
          </View>

          {/* BADGE STATUS: ATIVO OU SUSPENSO */}
          <View style={[styles.statusBadge, { backgroundColor: isSuspenso ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
            <View style={[styles.dotIndicator, { backgroundColor: isSuspenso ? '#EF4444' : '#10B981' }]} />
            <Text style={[styles.statusBadgeText, { color: isSuspenso ? '#EF4444' : '#10B981' }]}>
              {item.statusContrato.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* DATA DA ÚLTIMA DESCONEXÃO */}
        {lastDisconnectFormatted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 2 }}>
            <Feather name="clock" size={12} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '600' }}>
              Última desconexão: {lastDisconnectFormatted}
            </Text>
          </View>
        ) : null}

        {/* DETALHES DE CONEXÃO E PLANO */}
        <View style={styles.detailsRow}>
          {item.pppoe_login ? (
            <View style={styles.detailTag}>
              <Feather name="user" size={11} color="#38BDF8" />
              <Text style={styles.detailTagText}>PPPoE: {item.pppoe_login}</Text>
            </View>
          ) : null}

          {item.plano ? (
            <View style={styles.detailTag}>
              <Feather name="zap" size={11} color="#F59E0B" />
              <Text style={styles.detailTagText} numberOfLines={1}>{item.plano}</Text>
            </View>
          ) : null}

          {item.hasExactCoords ? (
            <View style={[styles.detailTag, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Feather name="map-pin" size={11} color="#10B981" />
              <Text style={[styles.detailTagText, { color: '#10B981' }]}>No Mapa</Text>
            </View>
          ) : (
            <View style={[styles.detailTag, { backgroundColor: 'rgba(148, 163, 184, 0.12)' }]}>
              <Feather name="map-pin" size={11} color="#64748B" />
              <Text style={[styles.detailTagText, { color: '#64748B' }]}>Sem GPS (Apenas Lista)</Text>
            </View>
          )}
        </View>
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
            <Text style={styles.headerTitle}>Clientes Offline</Text>
            <Text style={styles.headerSubtitle}>
              {filteredList.length} de {clientesOffline.length} contratos desconectados
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={loadData} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="refresh-cw" size={18} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#64748B" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filtrar por nome, bairro ou login..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x-circle" size={16} color="#64748B" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* TOGGLE MODO DE VISUALIZAÇÃO: LISTA vs MAPA COM PINOS VERMELHOS */}
      <View style={styles.viewModeToggleRow}>
        <TouchableOpacity
          style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive]}
          onPress={() => setViewMode('list')}
          activeOpacity={0.85}
        >
          <Feather name="list" size={14} color={viewMode === 'list' ? '#F59E0B' : '#64748B'} style={{ marginRight: 6 }} />
          <Text style={[styles.viewModeBtnText, viewMode === 'list' && styles.viewModeBtnTextActive]}>
            Lista ({filteredList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewModeBtn, viewMode === 'map' && styles.viewModeBtnActiveMap]}
          onPress={() => setViewMode('map')}
          activeOpacity={0.85}
        >
          <Feather name="map-pin" size={14} color={viewMode === 'map' ? '#EF4444' : '#64748B'} style={{ marginRight: 6 }} />
          <Text style={[styles.viewModeBtnText, viewMode === 'map' && styles.viewModeBtnTextActiveMap]}>
            Mapa (Pinos Vermelhos)
          </Text>
        </TouchableOpacity>
      </View>

      {/* HORIZONTAL BAIRRO STRIP FILTER */}
      <View style={styles.bairroStripContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bairroStripContent}>
          {bairrosList.map((b) => {
            const isSelected = selectedBairro === b.name;
            return (
              <TouchableOpacity
                key={b.name}
                style={[styles.bairroPill, isSelected && styles.bairroPillActive]}
                onPress={() => setSelectedBairro(b.name)}
                activeOpacity={0.8}
              >
                <Text style={[styles.bairroPillText, isSelected && styles.bairroPillTextActive]}>
                  {b.name}
                </Text>
                <View style={[styles.bairroCountBadge, isSelected && styles.bairroCountBadgeActive]}>
                  <Text style={[styles.bairroCountText, isSelected && styles.bairroCountTextActive]}>
                    {b.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* BODY CONTENT */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>Carregando todos os contratos offline do SGP...</Text>
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="check-circle" size={44} color="#10B981" />
          <Text style={styles.emptyTitle}>Nenhum Cliente Offline</Text>
          <Text style={styles.emptySub}>Não foram encontrados clientes offline para o bairro ou filtro selecionado.</Text>
        </View>
      ) : viewMode === 'map' ? (
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <iframe
              srcDoc={generateMapHtml}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 16 }}
            />
          ) : (
            <WebView
              originWhitelist={['*']}
              source={{ html: generateMapHtml }}
              style={{ flex: 1, borderRadius: 16 }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.mapLoadingOverlay}>
                  <ActivityIndicator size="large" color="#EF4444" />
                  <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Carregando mapa de clientes offline...</Text>
                </View>
              )}
            />
          )}
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item, idx) => (item.servico_id ? item.servico_id.toString() : idx.toString())}
          renderItem={renderItem}
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
  bairroStripContainer: {
    marginBottom: 10,
  },
  bairroStripContent: {
    paddingHorizontal: 16,
  },
  bairroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  bairroPillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  bairroPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  bairroPillTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  bairroCountBadge: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  bairroCountBadgeActive: {
    backgroundColor: '#F59E0B',
  },
  bairroCountText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  bairroCountTextActive: {
    color: '#0F172A',
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
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#111726',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
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
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  clientSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  detailTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F30',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginTop: 4,
  },
  detailTagText: {
    color: '#CBD5E1',
    fontSize: 11,
    marginLeft: 5,
    fontWeight: '500',
  },

  // ESTILOS DO SELECTOR DE MODO DE VISUALIZAÇÃO E MAPA
  viewModeToggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#161F30',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  viewModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewModeBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  viewModeBtnActiveMap: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  viewModeBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  viewModeBtnTextActive: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  viewModeBtnTextActiveMap: {
    color: '#EF4444',
    fontWeight: '700',
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#0B0F17',
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0B0F17',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
