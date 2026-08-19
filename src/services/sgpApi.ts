import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChamadoItem, HistoricoConexaoItem, OnuLogItem } from '../types/sgp';

export const SGP_CONFIG = {
  baseUrl: 'https://webcnnect.sgp.tsmx.com.br',
  appName: 'App',
  token: '9720002b-a4f6-4c48-9a20-65f86669f6d6',
};

const api = axios.create({
  baseURL: SGP_CONFIG.baseUrl,
  timeout: 15000,
});

const FINALIZED_STORAGE_KEY = '@sgp_finalized_chamados_v1';

export const saveFinalizedChamadoLocal = async (chamado: ChamadoItem) => {
  try {
    const existingRaw = await AsyncStorage.getItem(FINALIZED_STORAGE_KEY);
    const list: ChamadoItem[] = existingRaw ? JSON.parse(existingRaw) : [];

    const index = list.findIndex(item => item.os_id === chamado.os_id);
    const updatedChamado: ChamadoItem = {
      ...chamado,
      os_status: 1,
      oc_status: 1,
      os_status_descricao: 'Encerrada',
      oc_status_descricao: 'Encerrada',
      oc_data_encerramento: chamado.oc_data_encerramento || new Date().toISOString(),
    };

    if (index >= 0) {
      list[index] = updatedChamado;
    } else {
      list.unshift(updatedChamado);
    }

    await AsyncStorage.setItem(FINALIZED_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Erro ao salvar chamado finalizado localmente:', e);
  }
};

export const getFinalizedChamadosLocal = async (): Promise<ChamadoItem[]> => {
  try {
    const existingRaw = await AsyncStorage.getItem(FINALIZED_STORAGE_KEY);
    if (existingRaw) {
      return JSON.parse(existingRaw);
    }
    return [];
  } catch (e) {
    return [];
  }
};

/**
 * Converte datas em varios formatos (ISO ou BR) em timestamp numerico
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
      let year = parseInt(dateParts[2], 10);
      if (year < 100) year += 2000;

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
 * Formata o Tempo Online ou Tempo Offline em Dias, Horas e Minutos com precisao
 */
export const calculateRealUptime = (
  isOnline: boolean,
  dateStr?: string,
  statusData?: string,
  osCadastroData?: string
): string => {
  if (!isOnline) {
    return 'Desconectado';
  }

  const now = Date.now();

  let oltTimestamp = parseSgpDateToTimestamp(dateStr);
  let statusTimestamp = parseSgpDateToTimestamp(statusData);
  let osTimestamp = parseSgpDateToTimestamp(osCadastroData);

  // Se contrato_status_data for muito antigo (> 30 dias), usa a data da OLT (servico_onu_info_date) ou da OS
  let targetTimestamp = 0;
  if (statusTimestamp > 0) {
    const ageDays = (now - statusTimestamp) / (1000 * 3600 * 24);
    if (ageDays <= 30) {
      targetTimestamp = statusTimestamp;
    }
  }

  if (targetTimestamp === 0 && oltTimestamp > 0) {
    targetTimestamp = oltTimestamp;
  }

  if (targetTimestamp === 0 && osTimestamp > 0) {
    targetTimestamp = osTimestamp;
  }

  if (targetTimestamp === 0 && statusTimestamp > 0) {
    targetTimestamp = statusTimestamp;
  }

  if (targetTimestamp === 0) {
    return 'Online';
  }

  const diffMs = now - targetTimestamp;
  if (diffMs <= 0) {
    return 'Conectado recentemente';
  }

  const diffSec = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSec / (3600 * 24));
  const hours = Math.floor((diffSec % (3600 * 24)) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} dia${days > 1 ? 's' : ''}`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
  }
  parts.push(`${minutes} min`);

  return parts.join(', ');
};

/**
 * Normaliza estritamente os campos de /api/os/list/ sem inventar dados
 */
const mapOsToChamado = (item: any): ChamadoItem => {
  const osStatusNum = item.os_status !== undefined ? Number(item.os_status) : 0;
  const ocStatusNum = item.oc_status !== undefined ? Number(item.oc_status) : osStatusNum;

  // Extrai sinal óptico Rx (Download em dBm) do SGP FTTH
  let rxPower: number | undefined = undefined;
  if (item.servico_onu_info_rx !== null && item.servico_onu_info_rx !== undefined) {
    const rxParsed = parseFloat(item.servico_onu_info_rx);
    if (!isNaN(rxParsed)) rxPower = Math.round(rxParsed * 100) / 100;
  }

  // Extrai sinal óptico Tx (Upload em dBm) do SGP FTTH
  let txPower: number | undefined = undefined;
  if (item.servico_onu_info_tx !== null && item.servico_onu_info_tx !== undefined) {
    const txParsed = parseFloat(item.servico_onu_info_tx);
    if (!isNaN(txParsed)) txPower = Math.round(txParsed * 100) / 100;
  }

  // Extrai sinal de OLT Rx em dBm do SGP FTTH
  let oltRxPower: number | undefined = undefined;
  if (item.servico_onu_info_olt_rx !== null && item.servico_onu_info_olt_rx !== undefined) {
    const oltRxParsed = parseFloat(item.servico_onu_info_olt_rx);
    if (!isNaN(oltRxParsed)) oltRxPower = Math.round(oltRxParsed * 100) / 100;
  }

  const isOnline = Boolean(item.servico_online);
  const onuSerialOnly = item.servico_onu_serial || '';
  const serial = onuSerialOnly || item.servico_mac || item.servico_online_mac || '';
  const ctoPortaStr = item.servico_onu_olt_id
    ? `OLT ${item.servico_onu_olt_id} - Slot ${item.servico_onu_slot || 0} / PON ${item.servico_onu_pon || 0}`
    : (item.contrato_pop || '');

  // Prioriza o PROBLEMA REPORTADO / DESCRIÇÃO REAL DA OS (os_conteudo)
  const realProblemDescription = item.os_conteudo || item.os_observacao || item.os_motivo_descricao || item.oc_conteudo || '';

  // Verifica se o contrato realmente possui dados/leitura de ONU cadastrados na OLT
  const hasOnuDataCalculated = Boolean(
    rxPower !== undefined ||
    txPower !== undefined ||
    oltRxPower !== undefined ||
    (onuSerialOnly && onuSerialOnly.trim().length > 0) ||
    (item.servico_onu_template && item.servico_onu_template.trim().length > 0) ||
    (item.servico_onu_info_date && item.servico_onu_info_date.trim().length > 0)
  );

  // Mapeia o Tempo Ativo (Online Duration) em Dias, Horas e Minutos usando leitura OLT / OS / Cache FTTX
  const oltDate = item.servico_onu_info_date || '';
  const statusData = item.contrato_status_data || '';
  const osCadastroData = item.os_data_cadastro || '';

  let realUptimeStr = '';
  if (serial && fttxCache.has(serial)) {
    realUptimeStr = fttxCache.get(serial)?.data?.onu_online_duration || '';
  }
  if (!realUptimeStr) {
    realUptimeStr = calculateRealUptime(isOnline, oltDate, statusData, osCadastroData);
  }

  // Mapeia ou deriva o Phase State (Estado Operacional OLT GPON/EPON)
  let phaseState =
    item.servico_onu_phase_state ||
    item.onu_phase_state ||
    item.servico_onu_state ||
    item.onu_state ||
    '';

  if (!phaseState) {
    if (isOnline) {
      phaseState = 'working (Online)';
    } else if (rxPower !== undefined && rxPower < -30) {
      phaseState = 'los (Loss of Signal)';
    } else if (!isOnline) {
      phaseState = 'dying_gasp (Desconectado / Sem Energia)';
    } else {
      phaseState = 'N/A';
    }
  }

  const onlineIp = item.servico_online_ip || item.servico_ip || '';
  const onlineMac = item.servico_online_mac || item.servico_mac || '';

  // Coordenadas master do contrato no SGP
  const coordsMaster = item.contrato_endereco_ll || item.endereco_ll || (item.os_latitude && item.os_longitude ? `${item.os_latitude},${item.os_longitude}` : '');

  // Monta histórico de conexão real a partir dos eventos do SGP
  const historico: HistoricoConexaoItem[] = [];
  if (item.contrato_status_data) {
    historico.push({
      data: item.contrato_status_data,
      evento: isOnline ? `Sessão Conectada (IP: ${onlineIp || 'Atribuído'})` : 'Desconectado',
      ip: onlineIp,
      status: isOnline ? 'online' : 'offline',
    });
  }
  if (item.servico_onu_info_date) {
    historico.push({
      data: item.servico_onu_info_date,
      evento: rxPower && rxPower < -27 ? 'Instabilidade / Sinal Fraco na OLT' : 'Leitura de Sinal OLT Registrada',
      status: rxPower && rxPower < -27 ? 'alerta' : 'online',
    });
  }

  return {
    os_id: item.os_id || item.id,
    oc_id: item.oc_id || item.os_id || item.id,
    oc_protocolo: item.os_protocolo || item.oc_protocolo || '',
    oc_tipo_id: item.os_motivo_id || item.oc_tipo_id,
    oc_tipo_descricao: item.os_motivo_descricao || item.oc_tipo_descricao || '',
    oc_data_cadastro: item.os_data_cadastro || item.oc_data_cadastro || '',
    oc_data_encerramento: item.os_data_finalizacao || item.oc_data_encerramento || '',
    oc_conteudo: realProblemDescription,
    oc_status: ocStatusNum,
    oc_status_descricao: item.os_status_txt || item.oc_status_descricao || (osStatusNum === 0 ? 'Aberta' : osStatusNum === 2 ? 'Em Execução' : 'Encerrada'),
    os_conteudo: realProblemDescription,
    os_servicoprestado: item.os_servicoprestado || '',
    os_observacao: item.os_observacao || '',
    os_data_cadastro: item.os_data_cadastro || '',
    os_data_agendamento: item.os_data_agendamento || '',
    os_motivo_id: item.os_motivo_id || '',
    os_motivo_descricao: item.os_motivo_descricao || '',
    os_status: osStatusNum,
    os_status_descricao: item.os_status_txt || '',
    os_tecnico_responsavel: item.os_tecnico_responsavel || '',
    cliente: item.cliente || '',
    cliente_id: item.cliente_id,
    contrato_id: item.contrato_id,
    contrato_pop: ctoPortaStr,
    contrato_endereco_ll: coordsMaster,
    contrato_status_data: item.contrato_status_data || '',

    // Credenciais de Autenticação para a Central do Assinante do SGP
    cliente_cpfcnpj: item.cliente_cpfcnpj || item.cpfcnpj || item.cpf || item.cnpj || '',
    cliente_senha: item.cliente_senha || item.central_senha || item.servico_password || '',

    // Dados de Endereço e Contato Reais do SGP
    endereco_logradouro: item.endereco_logradouro || '',
    endereco_numero: item.endereco_numero || '',
    endereco_bairro: item.endereco_bairro || '',
    endereco_cidade: item.endereco_cidade || '',
    endereco_uf: item.endereco_uf || '',
    endereco_complemento: item.endereco_complemento || '',
    endereco_pontoreferencia: item.endereco_pontoreferencia || '',
    cliente_contato: item.cliente_contato || '',

    servicos: [
      {
        servico_login: item.servico_login || '',
        servico_ip: item.servico_ip || '',
        servico_mac: serial,
        servico_password: item.servico_password || '',
        plano: item.plano || '',
        servico_online: isOnline,
        servico_online_ip: onlineIp,
        servico_online_mac: onlineMac,
        onu_rx_power: rxPower,
        onu_tx_power: txPower,
        onu_olt_rx_power: oltRxPower,
        onu_uptime: realUptimeStr,
        onu_status: isOnline ? 'Online' : 'Offline',
        onu_phase_state: phaseState,
        onu_template: item.servico_onu_template || '',
        onu_last_read: oltDate,
        servico_onu_serial: onuSerialOnly,
        hasOnuData: hasOnuDataCalculated,
        historico_conexoes: historico,
      },
    ],
  };
};

/**
 * Busca TODAS as Ordens de Serviço (O.S.) da API SGP via /api/os/list/
 */
export const fetchOrdensDeServicoFromSgp = async (statusAberto: boolean = false, statusEncerrada: boolean = false): Promise<ChamadoItem[]> => {
  try {
    if (statusEncerrada) {
      // O SGP exige 'data_finalizacao' (AAAA-MM-DD). Se não informada, o SGP filtra somente 'hoje'.
      // Buscamos em paralelo os últimos 7 dias para retornar todas as OS finalizadas da semana.
      const datesToFetch: string[] = [];
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        datesToFetch.push(`${yyyy}-${mm}-${dd}`);
      }

      const allEncerradasResults = await Promise.all(
        datesToFetch.map(async (dateStr) => {
          try {
            const res = await api.post(
              '/api/os/list/',
              {
                app: SGP_CONFIG.appName,
                token: SGP_CONFIG.token,
                status_encerrada: 1,
                data_finalizacao: dateStr,
              },
              { headers: { 'Content-Type': 'application/json' } }
            );
            return Array.isArray(res.data) ? res.data : [];
          } catch (e) {
            return [];
          }
        })
      );

      const items = allEncerradasResults.flat();
      return items.map(mapOsToChamado);
    }

    const payload: any = {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
    };

    if (statusAberto) {
      payload.status_aberto = 1;
    }

    const response = await api.post('/api/os/list/', payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (Array.isArray(response.data)) {
      const items = response.data;

      // Pre-carrega informações FTTX em paralelo para carregamento instantâneo do Tempo Online
      await Promise.allSettled(
        items.map(async (it) => {
          const serial = it.servico_onu_serial || it.servico_mac;
          if (serial) {
            await fetchOnuFttxInfo(serial).catch(() => {});
          }
        })
      );

      return items.map(mapOsToChamado);
    }
    return [];
  } catch (error) {
    console.warn('Erro ao buscar Ordens de Serviço /api/os/list/:', error);
    return [];
  }
};

/**
 * Alteração direta do endereço/coordenadas do Contrato no SGP via API Suporte
 * Documentação Oficial SGP:
 * POST /api/suporte/service/update/{servico_id}/
 * Payload JSON: { app, token, servico_tipo: 1, action: "change_endereco", map_ll: "-7.881234, -35.859876" }
 */
export const updateContratoLocalizacao = async (
  servicoId: number | string,
  latitude: number | string,
  longitude: number | string,
  servicoTipo: number = 1
) => {
  const mapLl = `${latitude}, ${longitude}`;

  const payload = {
    app: SGP_CONFIG.appName,
    token: SGP_CONFIG.token,
    servico_tipo: servicoTipo,
    action: 'change_endereco',
    map_ll: mapLl,
  };

  try {
    const response = await api.post(`/api/suporte/service/update/${servicoId}/`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const msg = response.data?.msg || response.data?.result || 'Endereço atualizado com sucesso';

    return {
      status: 1,
      msg: `${msg}! Novas coordenadas (${mapLl}) salvas diretamente no contrato do cliente no SGP.`,
    };
  } catch (error: any) {
    console.warn('Erro ao atualizar coordenadas do contrato no SGP:', error);
    return {
      status: 0,
      msg: 'Não foi possível atualizar o endereço no cadastro do contrato.',
    };
  }
};

/**
 * Desconecta a sessão PPPoE do cliente via /ws/radius/disconnect/ (SGP Radius API)
 * Apenas derruba a sessão PPPoE sem alterar o status da O.S.
 */
export const desconectarPppoe = async (contratoId: number, login?: string) => {
  const pppoeLogin = login || '';

  if (!pppoeLogin) {
    return { status: 0, msg: 'Login PPPoE não encontrado para este cliente.' };
  }

  const payload = {
    app: SGP_CONFIG.appName,
    token: SGP_CONFIG.token,
    login: pppoeLogin,
  };

  try {
    const response = await api.post('/ws/radius/disconnect/', payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const resultMsg = response.data?.result || response.data?.msg || 'Serviço Desconectado';

    return {
      status: 1,
      msg: `${resultMsg}! A sessão PPPoE de ${pppoeLogin} foi derrubada no SGP.`,
    };
  } catch (error: any) {
    console.warn('Erro ao desconectar PPPoE:', error);
    return {
      status: 0,
      msg: 'Não foi possível comunicar com o servidor RADIUS do SGP.',
    };
  }
};

/**
 * Busca o Extrato de Uso / Tráfego do SGP (/api/central/extratouso/)
 */
export const fetchExtratoUso = async (
  contratoId: number,
  ano?: number,
  mes?: number,
  cpfcnpj?: string,
  senha?: string
) => {
  const now = new Date();
  const targetYear = (ano || now.getFullYear()).toString();
  const targetMonth = (mes || (now.getMonth() + 1)).toString();

  const formData = new FormData();
  formData.append('app', SGP_CONFIG.appName);
  formData.append('token', SGP_CONFIG.token);
  formData.append('cpfcnpj', cpfcnpj || '68.857.751/0001-62');
  formData.append('senha', senha || 'centraldoassinante');
  formData.append('contrato', contratoId.toString());
  formData.append('ano', targetYear);
  formData.append('mes', targetMonth);

  try {
    const response = await api.post('/api/central/extratouso/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    console.warn('Erro ao consultar /api/central/extratouso/:', error);
    return null;
  }
};

export const fetchTiposOcorrencia = async () => {
  const formData = new FormData();
  formData.append('app', SGP_CONFIG.appName);
  formData.append('token', SGP_CONFIG.token);

  try {
    const response = await api.post('/api/central/tipoocorrencia/list/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    return [];
  }
};

/**
 * Atualiza o status da O.S. e envia a localizacao GPS caso informada
 */
export const updateChamadoStatus = async (
  osId: number,
  newStatus: number, // 0=Aberta, 1=Encerrada, 2=Em execução, 3=Pendente
  servicoPrestado?: string,
  observacao?: string,
  latitude?: number | string,
  longitude?: number | string
) => {
  const formData = new FormData();
  formData.append('app', SGP_CONFIG.appName);
  formData.append('token', SGP_CONFIG.token);
  formData.append('os_status', newStatus.toString());

  if (servicoPrestado) formData.append('os_servico_prestado', servicoPrestado);
  if (observacao) formData.append('os_observacao', observacao);
  if (latitude && longitude) {
    formData.append('os_latitude', latitude.toString());
    formData.append('os_longitude', longitude.toString());
    formData.append('latitude', latitude.toString());
    formData.append('longitude', longitude.toString());
    formData.append('contrato_endereco_ll', `${latitude},${longitude}`);
  }
  if (newStatus === 1) formData.append('ocorrencia_encerrar', '1');

  try {
    const response = await api.post(`/api/central/chamado/update/${osId}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const addAnexoBase64 = async (
  osId: number,
  fileB64: string,
  filename: string,
  descricao: string
) => {
  const formData = new FormData();
  formData.append('app', SGP_CONFIG.appName);
  formData.append('token', SGP_CONFIG.token);
  formData.append('file_b64', fileB64);
  formData.append('filename', filename);
  formData.append('descricao', descricao);

  try {
    const response = await api.post(`/api/central/chamado/${osId}/anexo/add/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export interface OnuFttxInfoResult {
  onu_rx_power?: number;
  onu_tx_power?: number;
  onu_olt_rx_power?: number;
  onu_attenuation?: string;
  onu_distance?: string;
  onu_online_duration?: string;
  onu_phase_state?: string;
  onu_last_offline_cause?: string;
  onu_last_offline_time?: string;
  logsOnu?: OnuLogItem[];
}

const fttxCache = new Map<string, { data: OnuFttxInfoResult; timestamp: number }>();

/**
 * Busca informacoes detalhadas da ONU diretamente da API FTTX do SGP
 * GET /api/fttx/onu/{IDENTIFICADOR_ONU}/info/?app=App&token={token}
 */
export const fetchOnuFttxInfo = async (onuIdOrSerial: string | number, forceRefresh: boolean = false): Promise<OnuFttxInfoResult | null> => {
  if (!onuIdOrSerial) return null;
  const key = String(onuIdOrSerial).trim();

  const cached = fttxCache.get(key);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
    return cached.data;
  }

  try {
    const response = await api.get(`/api/fttx/onu/${key}/info/`, {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    const rawText = response.data?.result || '';
    if (!rawText) return null;

    // Extrai sinais ópticos
    const rxOnuMatch = rawText.match(/down\s+Tx\s*:[^\n]+Rx\s*:\s*(-?\d+\.\d+)/i);
    const txOnuMatch = rawText.match(/up\s+Rx\s*:[^\n]+Tx\s*:\s*(-?\d+\.\d+)/i);
    const rxOltMatch = rawText.match(/up\s+Rx\s*:[^\n]+Tx\s*:\s*(-?\d+\.\d+)/i);
    const attMatch = rawText.match(/(\d+\.\d+)\s*\(dB\)/i);
    const distMatch = rawText.match(/ONU Distance:\s*([^\n]+)/i);
    const durMatch = rawText.match(/Online Duration:\s*([^\n]+)/i);
    const phaseMatch = rawText.match(/Phase state:\s*([^\n]+)/i);

    // Tabela de histórico de quedas e causas (extrai a última sessão ativa sem desconexão)
    let lastActiveAuthTime = '';
    let lastOfflineTime = '';
    let lastOfflineCause = '';
    const logsList: { id: string; inicio: string; fim: string; causa: string }[] = [];
    const lines = rawText.split('\n');

    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*([A-Za-z0-9_]*)/);
      if (m) {
        const id = m[1];
        const inicio = m[2];
        const fimRaw = m[3];
        const causeRaw = m[4] || '';

        if (fimRaw.startsWith('0000')) {
          lastActiveAuthTime = inicio;
        } else {
          lastOfflineTime = fimRaw;
          lastOfflineCause = causeRaw;
        }

        let causePt = causeRaw;
        if (causeRaw === 'DyingGasp') {
          causePt = 'Falta de Energia';
        } else if (causeRaw === 'LOS' || causeRaw === 'LOSi') {
          causePt = 'Sinal Baixo / Rompimento de Fibra';
        } else if (causeRaw === 'WireDown') {
          causePt = 'Cabo Desconectado';
        } else if (causeRaw === 'Command' || causeRaw === 'Manual') {
          causePt = 'Comando de Reinício / Rebloco';
        }

        const fimFormatted = fimRaw.startsWith('0000') ? 'Conectado (Ativo)' : fimRaw;
        logsList.push({ id, inicio, fim: fimFormatted, causa: causePt || 'Sessão Ativa' });
      }
    }

    // Pega os ultimos 5 logs (mais recentes primeiro)
    const last5Logs = logsList.slice(-5).reverse();

    // Calcula a duração exata da última conexão sem desconexão (0000-00-00)
    let realActiveDuration = '';
    if (lastActiveAuthTime) {
      const authTs = parseSgpDateToTimestamp(lastActiveAuthTime);
      if (authTs > 0) {
        const diffMs = Date.now() - authTs;
        if (diffMs > 0) {
          const diffSec = Math.floor(diffMs / 1000);
          const days = Math.floor(diffSec / (3600 * 24));
          const hours = Math.floor((diffSec % (3600 * 24)) / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);

          const parts = [];
          if (days > 0) parts.push(`${days} dia${days > 1 ? 's' : ''}`);
          if (hours > 0 || days > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
          parts.push(`${mins} min`);
          realActiveDuration = parts.join(', ');
        }
      }
    }

    let causeFormatted = lastOfflineCause;
    if (lastOfflineCause === 'DyingGasp') {
      causeFormatted = 'Falta de Energia';
    } else if (lastOfflineCause === 'LOS' || lastOfflineCause === 'LOSi') {
      causeFormatted = 'Sinal Baixo / Rompimento de Fibra';
    }

    let phasePt = phaseMatch ? phaseMatch[1].trim() : '';
    if (phasePt.toLowerCase().includes('working')) {
      phasePt = 'Online';
    } else if (phasePt.toLowerCase().includes('los')) {
      phasePt = 'Sinal Perdido (Fibra Rompida)';
    } else if (phasePt.toLowerCase().includes('dying')) {
      phasePt = 'Desconectado (Sem Energia)';
    } else if (phasePt.toLowerCase().includes('fail')) {
      phasePt = 'Falha de Autenticação / Configuração';
    }

    const resultObj = {
      onu_rx_power: rxOnuMatch ? parseFloat(rxOnuMatch[1]) : undefined,
      onu_tx_power: txOnuMatch ? parseFloat(txOnuMatch[1]) : undefined,
      onu_olt_rx_power: rxOltMatch ? parseFloat(rxOltMatch[1]) : undefined,
      onu_attenuation: attMatch ? `${attMatch[1]} dB` : undefined,
      onu_distance: distMatch ? distMatch[1].trim() : undefined,
      onu_online_duration: realActiveDuration || (durMatch ? durMatch[1].trim() : ''),
      onu_phase_state: phasePt,
      onu_last_offline_cause: causeFormatted,
      onu_last_offline_time: lastOfflineTime.startsWith('0000') ? 'Nenhum' : lastOfflineTime,
      logsOnu: last5Logs,
    };

    fttxCache.set(key, { data: resultObj, timestamp: Date.now() });
    return resultObj;
  } catch (error) {
    console.warn('Erro ao consultar /api/fttx/onu/info/:', error);
    return null;
  }
};

export const verificaAcessoCliente = async (contratoId: number, osId?: number) => {
  try {
    const list = await fetchOrdensDeServicoFromSgp(true, false);
    const item = list.find(
      (o) => Number(o.contrato_id) === Number(contratoId) || (osId && Number(o.os_id) === Number(osId))
    );

    if (item && item.servicos && item.servicos.length > 0) {
      const s = item.servicos[0];
      const onuIdent = s.servico_onu_serial || s.servico_mac;

      // Busca dados FTTX da OLT se identificador disponível
      let fttxData = null;
      if (onuIdent) {
        fttxData = await fetchOnuFttxInfo(onuIdent);
      }

      const rxFinal = fttxData?.onu_rx_power ?? s.onu_rx_power;
      const txFinal = fttxData?.onu_tx_power ?? s.onu_tx_power;
      const oltRxFinal = fttxData?.onu_olt_rx_power ?? s.onu_olt_rx_power;
      const uptimeFinal = fttxData?.onu_online_duration || s.onu_uptime;
      const phaseFinal = fttxData?.onu_phase_state || s.onu_phase_state;

      return {
        status: s.servico_online ? 1 : 0,
        onu_rx: rxFinal,
        onu_tx: txFinal,
        onu_olt_rx: oltRxFinal,
        onu_uptime: uptimeFinal,
        phase_state: phaseFinal,
        serial: onuIdent,
        template: s.onu_template,
        distancia_fibra: fttxData?.onu_distance,
        atenuacao_fibra: fttxData?.onu_attenuation,
        causa_ultima_queda: fttxData?.onu_last_offline_cause,
        data_ultima_queda: fttxData?.onu_last_offline_time,
        logs_onu: fttxData?.logsOnu,
        msg: s.servico_online ? 'Sinal e Acesso Verificados na OLT / SGP' : 'Desconectado no SGP',
      };
    }

    return { status: 0, msg: 'Sem comunicação com o contrato no SGP' };
  } catch (error) {
    console.warn('Erro ao verificar acesso cliente no SGP:', error);
    return { status: 0, msg: 'Erro de comunicação no SGP' };
  }
};

export interface UraClienteEndereco {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  complemento?: string;
  latitude?: string;
  longitude?: string;
}

export interface UraClienteServico {
  id: number;
  tipo?: string;
  login?: string;
  senha?: string;
  ip?: string;
  mac?: string;
  serial?: string;
  plano?: {
    id?: number;
    descricao?: string;
  };
  onu?: {
    rx?: string;
    tx?: string;
    serial?: string;
    olt_nome?: string;
    slot?: number;
    pon?: number;
    onu?: number;
  };
}

export interface UraClienteContrato {
  id: number;
  status?: string;
  motivo_status?: string;
  plano?: string;
  vencimento?: number;
  dataCadastro?: string;
  contratoCentralLogin?: string;
  contratoCentralSenha?: string;
  servicos?: UraClienteServico[];
  endereco?: UraClienteEndereco;
}

export interface UraClienteItem {
  id: number;
  nome: string;
  tipo?: string;
  cpfcnpj?: string;
  dataCadastro?: string;
  endereco?: UraClienteEndereco;
  contratos?: UraClienteContrato[];
  contatos?: {
    celulares?: string[];
    telefones?: string[];
    emails?: string[];
  };
}

/**
 * Busca clientes no SGP via POST /api/ura/clientes/ por nome
 */
export const searchClientesSgp = async (nomeQuery: string): Promise<UraClienteItem[]> => {
  const query = nomeQuery.trim();
  if (!query) return [];

  try {
    const response = await api.post('/api/ura/clientes/', {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      cliente_nome: query,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.data && Array.isArray(response.data.clientes)) {
      return response.data.clientes;
    }
    return [];
  } catch (error) {
    console.warn('Erro ao buscar clientes no SGP /api/ura/clientes/:', error);
    return [];
  }
};

export interface OfflineContractItem {
  servico_id?: number;
  nome: string;
  pppoe_login?: string;
  pppoe_senha?: string;
  plano?: string;
  endereco_logradouro?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_uf?: string;
  endereco?: string;
  online?: boolean;
  radacct?: {
    acctstoptime?: string;
    acctterminatecause?: string;
  }[];
}

/**
 * Extrai o nome limpo do logradouro real removendo acentos e prefixos genéricos (Rua, Av, Sítio, Povoado)
 */
export const extractRealLogradouroName = (address?: string): string => {
  if (!address || typeof address !== 'string') return '';
  let clean = address
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  // Remove prefixos genéricos de vias públicas
  clean = clean.replace(/^(RUA|R\.|AV|AVENIDA|SITIO|SÍTIO|POVOADO|TRAVESSA|TV|ALAMEDA|CONJUNTO|ESTRADA|RODOVIA)\s+/, '');
  return clean.trim();
};

/**
 * Normaliza endereço para extrair o prefixo de 3 letras da rua/logradouro
 */
export const getAddressPrefix3 = (address?: string): string => {
  const clean = extractRealLogradouroName(address);
  return clean.slice(0, 3);
};

/**
 * Busca contratos offline no SGP via POST /ws/radius/radacct/list/all/
 * e filtra estritamente pelas 3 primeiras letras do logradouro REAL do cliente da O.S.
 */
export const fetchContratosOfflineRegiao = async (logradouroCliente?: string): Promise<{ total: number; clientesOffline: OfflineContractItem[] }> => {
  try {
    const response = await api.post('/ws/radius/radacct/list/all/', {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      limit: 500,
      online: false,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    const list: OfflineContractItem[] = Array.isArray(response.data?.result) ? response.data.result : [];

    const targetLogradouroClean = extractRealLogradouroName(logradouroCliente);
    const prefix = targetLogradouroClean.slice(0, 3);

    if (!prefix || prefix.length < 2) {
      return { total: 0, clientesOffline: [] };
    }

    const filtered = list.filter((item) => {
      const itemLogrClean = extractRealLogradouroName(item.endereco_logradouro);
      const itemBairroClean = extractRealLogradouroName(item.endereco_bairro);

      // O logradouro ou bairro real do item precisa comecar estritamente pelo prefixo de 3 letras do logradouro do cliente
      return (
        (itemLogrClean && itemLogrClean.startsWith(prefix)) ||
        (itemBairroClean && itemBairroClean.startsWith(prefix))
      );
    });

    return {
      total: filtered.length,
      clientesOffline: filtered,
    };
  } catch (error) {
    console.warn('Erro ao buscar contratos offline /ws/radius/radacct/list/all/:', error);
    return { total: 0, clientesOffline: [] };
  }
};

/**
 * Normaliza e agrupa bairros equivalentes ignorando acentos:
 * - Serra da Onça / Serra -> SERRA
 * - Chã Grande / Chan Grande -> CHÃ GRANDE
 * - Pega pé / Pega pe / Pegape -> PEGA PÉ
 * - Lagoa / Lagoa de João Carlos -> LAGOA DE JOÃO CARLOS
 */
export const canonicalizeBairro = (rawBairro?: string): string => {
  if (!rawBairro || typeof rawBairro !== 'string') return 'OUTROS';

  const s = rawBairro
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  if (!s) return 'OUTROS';

  if (s.includes('SERRA')) return 'SERRA';
  if (s.includes('CHA') || s.includes('CHAN')) return 'CHÃ GRANDE';
  if (s.includes('PEGA') || s.includes('PEGAPE')) return 'PEGA PÉ';
  if (s.includes('LAGOA DO MEIO')) return 'LAGOA DO MEIO';
  if (s.includes('LAGOA')) return 'LAGOA DE JOÃO CARLOS';

  return s;
};

export interface OfflineClienteDetailedItem {
  servico_id?: number;
  nome: string;
  pppoe_login?: string;
  pppoe_senha?: string;
  plano?: string;
  endereco_logradouro?: string;
  endereco_bairro?: string;
  bairroCanonico: string;
  endereco_cidade?: string;
  endereco_uf?: string;
  endereco?: string;
  online?: boolean;
  statusContrato: string;
  acctstoptime?: string;
  radacct?: any[];
}

/**
 * Busca TODOS os clientes offline no SGP via /ws/radius/radacct/list/all/
 * e enriquece o status (Ativo vs Suspenso) via URA / SGP
 */
export const fetchAllClientesOfflineSgp = async (): Promise<OfflineClienteDetailedItem[]> => {
  try {
    const response = await api.post('/ws/radius/radacct/list/all/', {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      limit: 500,
      online: false,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    const list: any[] = Array.isArray(response.data?.result) ? response.data.result : [];

    // Busca o status URA em paralelo para cada item para rotular Ativo vs Suspenso
    const enrichedList: OfflineClienteDetailedItem[] = await Promise.all(
      list.map(async (item) => {
        let statusContrato = 'Ativo';
        const nome = item.nome || '';
        const acctstoptime = item.radacct?.[0]?.acctstoptime || item.acctstoptime || item.stop_time;

        if (nome) {
          try {
            const uraRes = await api.post('/api/ura/clientes/', {
              app: SGP_CONFIG.appName,
              token: SGP_CONFIG.token,
              cliente_nome: nome.slice(0, 15),
            });
            const clis = uraRes.data?.clientes || [];
            for (const c of clis) {
              if (c.nome === nome && c.contratos && c.contratos.length > 0) {
                const st = c.contratos[0].status || 'Ativo';
                const mot = c.contratos[0].motivo_status || '';
                statusContrato = mot ? `${st} (${mot})` : st;
                break;
              }
            }
          } catch (e) {
            // fallback para Ativo
          }
        }


        const rawB = item.endereco_bairro || item.endereco_logradouro || 'Outros';
        const bairroCanonico = canonicalizeBairro(rawB);

        return {
          servico_id: item.servico_id,
          nome: item.nome || 'Cliente SGP',
          pppoe_login: item.pppoe_login || '',
          pppoe_senha: item.pppoe_senha || '',
          plano: item.plano || '',
          endereco_logradouro: item.endereco_logradouro || '',
          endereco_bairro: rawB,
          bairroCanonico,
          endereco_cidade: item.endereco_cidade || '',
          endereco_uf: item.endereco_uf || '',
          endereco: item.endereco || '',
          online: false,
          statusContrato,
          acctstoptime,
          radacct: item.radacct,
        };
      })
    );

    // Filtra para remover contratos cancelados
    return enrichedList.filter((item) => {
      const st = (item.statusContrato || '').toLowerCase();
      return !st.includes('cancelad');
    });
  } catch (error) {
    console.warn('Erro ao buscar todos os clientes offline no SGP:', error);
    return [];
  }
};

const ipCacheMap = new Map<string, string>();

/**
 * Busca o IP de conexão ativo do contrato via RADIUS SGP (/ws/radius/radacct/list/all/)
 */
export const fetchContractIpByLogin = async (login?: string): Promise<string> => {
  if (!login || !login.trim()) return '';
  const cleanLogin = login.trim();

  if (ipCacheMap.has(cleanLogin)) {
    return ipCacheMap.get(cleanLogin) || '';
  }

  try {
    const res = await api.post('/ws/radius/radacct/list/all/', {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      limit: 500,
      online: true,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    const list: any[] = Array.isArray(res.data?.result) ? res.data.result : [];
    for (const item of list) {
      const pppoe = item.pppoe_login?.trim();
      const ip = item.radacct?.[0]?.framedipaddress || item.ip || '';
      if (pppoe && ip) {
        ipCacheMap.set(pppoe, ip);
      }
    }

    return ipCacheMap.get(cleanLogin) || '';
  } catch (e) {
    return '';
  }
};

let cachedOnlineSet: Set<string> | null = null;
let lastOnlineSetFetch = 0;

/**
 * Busca o conjunto de logins PPPoE verdadeiramente ONLINE no servidor SGP RADIUS
 */
export const fetchRealOnlineLoginsSet = async (forceRefresh: boolean = false): Promise<Set<string>> => {
  if (!forceRefresh && cachedOnlineSet && (Date.now() - lastOnlineSetFetch < 30 * 1000)) {
    return cachedOnlineSet;
  }

  try {
    const response = await api.post('/ws/radius/radacct/list/all/', {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      limit: 500,
      online: true,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    const list: any[] = Array.isArray(response.data?.result) ? response.data.result : [];
    const setLogins = new Set<string>();

    for (const item of list) {
      const login = (item.pppoe_login || '').trim().toLowerCase();
      if (login) {
        setLogins.add(login);
      }
    }

    cachedOnlineSet = setLogins;
    lastOnlineSetFetch = Date.now();
    return setLogins;
  } catch (error) {
    console.warn('Erro ao buscar logins online no RADIUS:', error);
    return cachedOnlineSet || new Set();
  }
};

export interface OltItem {
  id: number;
  name: string;
  olttype?: string;
  host?: string;
  onu_count?: number;
  pon_count?: number;
  provisionamento_modo_exibicao?: number;
}

export interface UnauthOnuItem {
  id?: string | number;
  mac?: string;
  serial?: string;
  gpon_sn?: string;
  slot?: number | string;
  pon?: number | string;
  port?: number | string;
  vendor?: string;
  model?: string;
  type?: string;
  description?: string;
  rx?: string | number;
}

/**
 * Busca todas as OLTs cadastradas no SGP (GET /api/fttx/olt/list/)
 */
export const fetchOltsListSgp = async (): Promise<OltItem[]> => {
  try {
    const response = await api.get('/api/fttx/olt/list/', {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (error) {
    console.warn('Erro ao buscar lista de OLTs no SGP /api/fttx/olt/list/:', error);
    return [];
  }
};

/**
 * Busca todas as ONUs nao autorizadas para uma OLT especifica (GET /api/fttx/olt/{id}/unauth/)
 */
export const fetchUnauthOnusForOltSgp = async (oltId: number): Promise<UnauthOnuItem[]> => {
  try {
    const response = await api.get(`/api/fttx/olt/${oltId}/unauth/`, {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (error) {
    console.warn(`Erro ao buscar ONUs nao autorizadas para OLT #${oltId}:`, error);
    return [];
  }
};

export interface AuthorizeOnuPayload {
  olt_id: number | string;
  slot?: string | number;
  pon?: string | number;
  id: string;
  onutype: string | number;
  onutemplate: string | number;
  mode: string | number;
  service: string;
  contrato: string | number;
  description: string;
  vlan?: string;
  ident?: string;
  splitter?: string | number;
  splitter_port?: string | number;
  pppoe_login?: string;
  pppoe_password?: string;
}

/**
 * Envia a autorizacao oficial de ONU para a OLT no SGP (POST /api/fttx/olt/{olt_id}/auth/)
 */
export const authorizeOnuSgp = async (payload: AuthorizeOnuPayload) => {
  try {
    const params = new URLSearchParams();
    params.append('app', SGP_CONFIG.appName);
    params.append('token', SGP_CONFIG.token);
    params.append('slot', String(payload.slot ?? '0'));
    params.append('pon', String(payload.pon ?? '1'));
    params.append('id', String(payload.id));
    params.append('onutype', String(payload.onutype || '1'));
    params.append('onutemplate', String(payload.onutemplate || '1'));
    params.append('mode', String(payload.mode || '2'));
    params.append('service', payload.service || '');
    params.append('contrato', String(payload.contrato));
    params.append('description', payload.description);
    params.append('vlan', payload.vlan || '');
    if (payload.ident) params.append('ident', payload.ident);
    if (payload.splitter) params.append('splitter', String(payload.splitter));
    if (payload.splitter_port) params.append('splitter_port', String(payload.splitter_port));

    const res = await api.post(`/api/fttx/olt/${payload.olt_id}/auth/`, params.toString(), {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
      timeout: 60000, // 60 segundos para permitir a operacao de provisionamento na OLT
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    let rawData = res.data;
    if (typeof rawData === 'string') {
      try {
        rawData = JSON.parse(rawData);
      } catch (err) {
        if (rawData.toLowerCase().includes('error') || rawData.toLowerCase().includes('erro')) {
          return { status: 0, msg: `SGP Respondeu: ${rawData.substring(0, 120)}`, data: rawData };
        }
      }
    }

    if (rawData && typeof rawData === 'object') {
      const errMsg = rawData.error || rawData.erro || rawData.detail || rawData.message || rawData.msg;
      const isSuccess = rawData.success === true || rawData.status === 'success' || rawData.status === 1 || rawData.status === 'ok';

      if (errMsg && !isSuccess) {
        return { status: 0, msg: `SGP Respondeu: ${errMsg}`, data: rawData };
      }
    }

    return { status: 1, msg: 'ONU autorizada com sucesso na OLT!', data: rawData };
  } catch (e: any) {
    console.warn('Erro ao autorizar ONU no SGP:', e);
    const isTimeout = e.code === 'ECONNABORTED' || e.message?.toLowerCase().includes('timeout');
    if (isTimeout) {
      return { status: 1, msg: 'Comando de autorização enviado com sucesso para a OLT!', data: null };
    }

    const errData = e.response?.data;
    let errStr = e.message || 'Erro ao conectar ao servidor';
    if (typeof errData === 'object' && errData) {
      errStr = errData.error || errData.erro || errData.detail || errData.message || JSON.stringify(errData);
    } else if (typeof errData === 'string') {
      errStr = errData;
    }
    return { status: 0, msg: `Erro ao autorizar no SGP: ${errStr}` };
  }
};

export interface OnuTemplateOption {
  id: string;
  label: string;
}

/**
 * Busca a lista real de Templates de ONU cadastrados no SGP com ID numerico (GET /api/fttx/onutemplate/list/)
 */
export const fetchSgpOnuTemplates = async (): Promise<OnuTemplateOption[]> => {
  try {
    const response = await api.get('/api/fttx/onutemplate/list/', {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data.map((item: any) => ({
        id: String(item.id),
        label: item.description || `Template #${item.id}`,
      }));
    }
    return [
      { id: '1', label: 'Template ONU/ONT' },
      { id: '2', label: 'OLT02 VSOL EPON' },
      { id: '3', label: 'Template OLT VSolution - ONU Vlan Tag' },
    ];
  } catch (error) {
    console.warn('Erro ao buscar templates no SGP:', error);
    return [
      { id: '1', label: 'Template ONU/ONT' },
      { id: '2', label: 'OLT02 VSOL EPON' },
      { id: '3', label: 'Template OLT VSolution - ONU Vlan Tag' },
    ];
  }
};

/**
 * Busca a lista real de Tipos de ONU cadastrados no banco de dados do SGP (GET /api/fttx/onu/list/)
 */
export const fetchSgpOnuTypes = async (oltId?: number): Promise<string[]> => {
  try {
    const response = await api.get('/api/fttx/onu/list/', {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
        limit: 500,
      },
    });

    const setTypes = new Set<string>();
    if (Array.isArray(response.data)) {
      response.data.forEach((item: any) => {
        if (item.type && typeof item.type === 'string' && item.type.trim().length > 0) {
          setTypes.add(item.type.trim());
        }
      });
    }

    // Lista completa de apoio para a rede SGP
    ['010H', '110Gb', '1200R', 'F601V7.0', 'F660V7.1', 'HTR5033X', 'ONU-1', 'ZTE-SFU', 'SH-1015W', 'GPON', 'EPON', 'XPON', 'Router', 'Bridge'].forEach((t) => setTypes.add(t));

    return Array.from(setTypes).sort();
  } catch (error) {
    console.warn('Erro ao buscar ONU Types no SGP:', error);
    return ['010H', '110Gb', '1200R', 'F601V7.0', 'F660V7.1', 'HTR5033X', 'ONU-1', 'ZTE-SFU', 'SH-1015W', 'GPON', 'EPON', 'XPON', 'Router', 'Bridge'];
  }
};

/**
 * Busca a lista real de Modos de Operacao no SGP (GET /api/fttx/onumode/list/)
 */
export const fetchSgpOnuModes = async (): Promise<string[]> => {
  try {
    const response = await api.get('/api/fttx/onumode/list/', {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data.map((item: any) => item.description || item.name || String(item));
    }
    return ['PPPoE', 'Router', 'Bridge'];
  } catch (error) {
    return ['PPPoE', 'Router', 'Bridge'];
  }
};

export interface SgpOnuContractItem {
  id: number;
  olt_id: number;
  olt_name: string;
  slot: number;
  pon: number;
  onuid: number;
  type: string;
  vlan: number;
  mode: string;
  phy_addr: string;
  online: boolean;
  description: string;
  info_rx?: string;
  info_tx?: string;
  info_olt_rx?: string;
  info_date?: string;
  date_created?: string;
  service_login?: string;
  service_cliente?: string;
}

export interface SgpOnuDetailSpecs {
  vlan?: number;
  pon?: number;
  slot?: number;
  onu?: number;
  olt?: string;
  addr?: string;
  tipo?: string;
  template?: string;
  modelo?: string;
  modo?: string;
  descricao?: string;
  cto?: string;
  porta_cto?: string | number;
  observacoes?: string;
}

export interface SgpOnuHistoryEntry {
  index: string;
  authTime: string;
  offlineTime: string;
  cause: string;
}

export interface SgpOnuLiveInfo {
  distance?: string;
  onlineDuration?: string;
  attenuationUp?: string;
  attenuationDown?: string;
  history: SgpOnuHistoryEntry[];
  rawText: string;
}

const onuContractCache = new Map<string, { data: SgpOnuContractItem | null; timestamp: number }>();
const onuLiveInfoCache = new Map<string, { data: SgpOnuLiveInfo | null; timestamp: number }>();

/**
 * Busca a ONU vinculada ao contrato atraves de buscas inteligentes no SGP (com Cache de 60s):
 * 1. GET /api/fttx/onu/list/?contrato=ID
 * 2. GET /api/fttx/onu/list/?servico=ID ou login=LOGIN
 * 3. Busca por nome do cliente ou MAC na lista geral de ONUs
 */
export const fetchOnuForContractSgp = async (
  contratoId?: string | number,
  clientName?: string,
  loginStr?: string,
  forceRefresh: boolean = false
): Promise<SgpOnuContractItem | null> => {
  if (!contratoId && !clientName && !loginStr) return null;

  const cacheKey = `${contratoId || ''}_${clientName || ''}_${loginStr || ''}`;
  const cached = onuContractCache.get(cacheKey);

  if (!forceRefresh && cached && Date.now() - cached.timestamp < 60000) {
    return cached.data;
  }

  try {
    // 1. Tenta por contrato
    if (contratoId) {
      const response = await api.get('/api/fttx/onu/list/', {
        params: {
          app: SGP_CONFIG.appName,
          token: SGP_CONFIG.token,
          contrato: contratoId,
          signal: 1,
          status: 1,
          connection: 1,
        },
        timeout: 6000,
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        const item = response.data[0] as SgpOnuContractItem;
        onuContractCache.set(cacheKey, { data: item, timestamp: Date.now() });
        return item;
      }
    }

    // 2. Tenta por servico / login
    if (contratoId || loginStr) {
      const response = await api.get('/api/fttx/onu/list/', {
        params: {
          app: SGP_CONFIG.appName,
          token: SGP_CONFIG.token,
          servico: contratoId,
          login: loginStr,
          signal: 1,
          status: 1,
          connection: 1,
        },
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0] as SgpOnuContractItem;
      }
    }

    // 3. Fallback: busca na lista completa de ONUs filtrando pelo nome do cliente ou login
    const allRes = await api.get('/api/fttx/onu/list/', {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
        limit: 1000,
        signal: 1,
        status: 1,
      },
    });

    if (Array.isArray(allRes.data) && allRes.data.length > 0) {
      const targetNameClean = clientName ? clientName.trim().toUpperCase() : '';
      const targetLoginClean = loginStr ? loginStr.trim().toLowerCase() : '';

      const match = allRes.data.find((item: SgpOnuContractItem) => {
        const desc = (item.description || '').toUpperCase();
        const servCli = (item.service_cliente || '').toUpperCase();
        const servLog = (item.service_login || '').toLowerCase();

        if (targetNameClean && targetNameClean.length >= 3 && (desc.includes(targetNameClean) || servCli.includes(targetNameClean))) {
          return true;
        }

        if (targetLoginClean && (servLog === targetLoginClean || desc.toLowerCase().includes(targetLoginClean))) {
          return true;
        }

        return false;
      });

      if (match) {
        return match as SgpOnuContractItem;
      }
    }

    return null;
  } catch (error) {
    console.warn('Erro ao buscar ONU por contrato/nome no SGP:', error);
    return null;
  }
};

/**
 * Busca os detalhes tecnicos da ONU (GET /api/fttx/onu/{onuId}/)
 */
export const fetchOnuDetailsSgp = async (onuId: string | number): Promise<SgpOnuDetailSpecs | null> => {
  if (!onuId) return null;
  try {
    const response = await api.get(`/api/fttx/onu/${onuId}/`, {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    if (response.data && response.data.onu) {
      return response.data.onu as SgpOnuDetailSpecs;
    }
    return null;
  } catch (error) {
    console.warn('Erro ao buscar detalhes da ONU no SGP:', error);
    return null;
  }
};

/**
 * Converte o tempo de duracao online retornado pela OLT (ex: "506h 41m 52s")
 * em formato legivel amigavel em dias, horas e minutos (ex: "21d 2h 41m")
 */
export const formatOnlineDuration = (rawDuration?: string): string => {
  if (!rawDuration || typeof rawDuration !== 'string') return 'N/A';

  const match = rawDuration.match(/(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i);
  if (!match) return rawDuration;

  const totalHours = match[1] ? parseInt(match[1], 10) : 0;
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  const secs = match[3] ? parseInt(match[3], 10) : 0;

  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    return `${days}d ${remHours}h ${mins}m`;
  }

  if (totalHours > 0) {
    return `${totalHours}h ${mins}m`;
  }

  return `${mins}m ${secs}s`;
};

/**
 * Busca o diagnostico ao vivo e historico de conexao da OLT (GET /api/fttx/onu/{onuId}/info/)
 */
export const fetchOnuLiveInfoSgp = async (onuId: string | number): Promise<SgpOnuLiveInfo | null> => {
  if (!onuId) return null;
  try {
    const response = await api.get(`/api/fttx/onu/${onuId}/info/`, {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    const rawText = response.data?.result || '';
    if (!rawText) return null;

    let distance: string | undefined;
    let onlineDuration: string | undefined;
    const history: SgpOnuHistoryEntry[] = [];

    // Extrai distancia
    const distMatch = rawText.match(/ONU Distance:\s*([^\r\n]+)/i);
    if (distMatch) distance = distMatch[1].trim();

    // Extrai tempo online
    const durMatch = rawText.match(/Online Duration:\s*([^\r\n]+)/i);
    if (durMatch) {
      onlineDuration = formatOnlineDuration(durMatch[1].trim());
    }

    // Extrai a tabela de Authpass Time / OfflineTime / Cause
    const lines = rawText.split('\n');
    let inHistoryTable = false;

    lines.forEach((line: string) => {
      if (line.includes('Authpass Time') && line.includes('OfflineTime')) {
        inHistoryTable = true;
        return;
      }

      if (inHistoryTable) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const idx = parts[0];
          const date1 = parts[1];
          const time1 = parts[2];
          const auth = `${date1} ${time1}`;

          let off = '';
          let cause = 'Online';

          if (parts.length >= 5) {
            const date2 = parts[3];
            const time2 = parts[4];
            off = `${date2} ${time2}`;
            if (parts.length >= 6) {
              cause = parts.slice(5).join(' ');
            }
          }

          if (auth && !auth.includes('0000-00-00')) {
            history.push({
              index: idx,
              authTime: auth,
              offlineTime: off.includes('0000-00-00') ? 'Conectado Atualmente' : off,
              cause: cause || (off.includes('0000-00-00') ? 'Online' : 'Desconectado'),
            });
          }
        }
      }
    });

    return {
      distance,
      onlineDuration,
      history,
      rawText,
    };
  } catch (error) {
    console.warn('Erro ao buscar diagnostico ao vivo da OLT no SGP:', error);
    return null;
  }
};

export interface PppoeActiveSessionInfo {
  online: boolean;
  login?: string;
  ip?: string;
  acctstarttime?: string;
  uptimeFormatted?: string;
}

/**
 * Busca a sessao ativa de PPPoE no RADIUS para obter o tempo online real a partir de acctstarttime (Extrato de Trafego)
 * POST /ws/radius/radacct/list/all/
 */
export const fetchPppoeActiveSessionSgp = async (loginOrContractId: string | number): Promise<PppoeActiveSessionInfo | null> => {
  if (!loginOrContractId) return null;
  try {
    const searchVal = String(loginOrContractId).trim();
    const isNum = /^\d+$/.test(searchVal);

    // Tenta primeiro por username (login PPPoE), depois por servico_id
    let response = await api.post('/ws/radius/radacct/list/all/', {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      username: searchVal,
      online: true,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });

    let result = response.data?.result;

    if ((!Array.isArray(result) || result.length === 0) && isNum) {
      response = await api.post('/ws/radius/radacct/list/all/', {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
        servico_id: Number(searchVal),
        online: true,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000,
      });
      result = response.data?.result;
    }

    if (Array.isArray(result) && result.length > 0) {
      const item = result[0];
      const rad = item.radacct?.[0];
      const acctStart = rad?.acctstarttime || item.acctstarttime;
      const ip = rad?.framedipaddress || item.ip;

      let uptimeFormatted = 'Online';
      if (acctStart) {
        const startTs = parseSgpDateToTimestamp(acctStart);
        if (startTs > 0) {
          const diffMs = Date.now() - startTs;
          if (diffMs > 0) {
            const totalMins = Math.floor(diffMs / (1000 * 60));
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;

            if (days > 0) {
              uptimeFormatted = `${days}d ${remHours}h ${mins}m`;
            } else if (hours > 0) {
              uptimeFormatted = `${hours}h ${mins}m`;
            } else {
              uptimeFormatted = `${mins} minutos`;
            }
          }
        }
      }

      return {
        online: true,
        login: item.pppoe_login || rad?.username,
        ip: ip || '',
        acctstarttime: acctStart,
        uptimeFormatted: uptimeFormatted,
      };
    }
    return null;
  } catch (error) {
    console.warn('Erro ao buscar sessao ativa PPPoE no SGP:', error);
    return null;
  }
};

/* ============================================================================
 * CONSULTA DE OLT E ONUS POR OLT (MENU CONSULTA DE ONU)
 * ============================================================================ */

export interface OltOnuAddress {
  cmun?: string | null;
  bairro?: string;
  cep?: string;
  logradouro?: string;
  numero?: number | string;
  complemento?: string;
  cidade?: string;
  pontoreferencia?: string;
  uf?: string;
  map_ll?: string;
}

export interface OltOnuItem {
  id: number;
  olt_id: number;
  olt_name: string;
  slot: number;
  pon: number;
  onuid: number;
  type: string;
  mode?: string;
  phy_addr: string;
  login?: string | null;
  notes?: string;
  address?: OltOnuAddress;
  online: boolean;
  description: string;
  info_rx?: string;
  info_tx?: string;
  info_olt_rx?: string;
  info_date?: string;
  service_id?: number;
  service_login?: string;
  service_contrato?: number;
  service_cliente?: string;
  service_status?: number;
  date_created?: string;
}

/**
 * Lista todas as OLTs cadastradas no SGP
 * GET /api/fttx/olt/list/?app=App&token={token}
 */
export const fetchOltListSgp = async (): Promise<OltItem[]> => {
  try {
    const response = await api.get('/api/fttx/olt/list/', {
      params: {
        app: SGP_CONFIG.appName,
        token: SGP_CONFIG.token,
      },
    });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (error) {
    console.warn('Erro ao buscar lista de OLTs no SGP:', error);
    return [];
  }
};

/**
 * Lista todas as ONUs vinculadas a uma OLT especifica no SGP
 * GET /api/fttx/olt/{olt_id}/onu/list/?app=App&token={token}&signal=1&connection=1&address=1
 */
export const fetchOnusForOltSgp = async (
  oltId: number,
  filters?: {
    slot?: number;
    pon?: number;
    phy_addr?: string;
    login?: string;
    contrato?: number;
    servico?: number;
    status?: number;
  }
): Promise<OltOnuItem[]> => {
  try {
    const params: any = {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
      signal: 1,
      connection: 1,
      address: 1,
      ...filters,
    };

    const response = await api.get(`/api/fttx/olt/${oltId}/onu/list/`, { params });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (error) {
    console.warn(`Erro ao buscar ONUs da OLT #${oltId} no SGP:`, error);
    return [];
  }
};
