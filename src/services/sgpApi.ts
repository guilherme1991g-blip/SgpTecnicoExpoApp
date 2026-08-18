import axios from 'axios';
import { ChamadoItem, HistoricoConexaoItem } from '../types/sgp';

export const SGP_CONFIG = {
  baseUrl: 'https://webcnnect.sgp.tsmx.com.br',
  appName: 'App',
  token: '9720002b-a4f6-4c48-9a20-65f86669f6d6',
};

const api = axios.create({
  baseURL: SGP_CONFIG.baseUrl,
  timeout: 15000,
});

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
    const payload: any = {
      app: SGP_CONFIG.appName,
      token: SGP_CONFIG.token,
    };

    if (statusAberto) {
      payload.status_aberto = 1;
    }

    if (statusEncerrada) {
      payload.status_encerrada = 1;
      payload.agendamento_inicial = '2024-01-01';
      payload.agendamento_final = '2026-12-31';
      payload.filtro_data = 1;
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

const fttxCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Busca informacoes detalhadas da ONU diretamente da API FTTX do SGP
 * GET /api/fttx/onu/{IDENTIFICADOR_ONU}/info/?app=App&token={token}
 */
export const fetchOnuFttxInfo = async (onuIdOrSerial: string | number, forceRefresh: boolean = false) => {
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

export interface UraClienteContrato {
  id: number;
  status?: string;
  plano?: string;
  vencimento?: number;
  dataCadastro?: string;
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
