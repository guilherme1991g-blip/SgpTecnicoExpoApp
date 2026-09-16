import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChamadoItem } from './sgpApi';

export const WEBHOOK_URL = 'https://n8n.zentos.com.br/webhook/recebeconcluido';
export const FACIAL_WEBHOOK_URL = 'https://n8n.zentos.com.br/webhook/reconhecimentofacil';
export const LOGGED_TECNICO_KEY = '@logged_tecnico_name';

/**
 * Obtém a identificação ÚNICA E REAL DO HARDWARE DO CELULAR (Android ID ou iOS IDFV)
 * Fornecida diretamente pelo Sistema Operacional do aparelho.
 */
export const getRealHardwareDeviceId = async (): Promise<string> => {
  try {
    if (Platform.OS === 'android') {
      const androidHardwareId = Application.getAndroidId();
      if (androidHardwareId && androidHardwareId.trim().length > 0) {
        return androidHardwareId.trim();
      }
    } else if (Platform.OS === 'ios') {
      const iosVendorId = await Application.getIosIdForVendorAsync();
      if (iosVendorId && iosVendorId.trim().length > 0) {
        return iosVendorId.trim();
      }
    }
  } catch (err) {
    console.warn('Erro ao ler Hardware ID nativo:', err);
  }

  return `${Device.brand || ''}_${Device.modelName || 'Device'}`.trim();
};

export interface AttendanceWebhookPayload {
  status: 'iniciado' | 'concluido' | 'em_atendimento' | 'encerrado';
  protocolo: string;
  tecnico?: string;
  dispositivo_id?: string;
  data_evento: string;
  link_rastreamento?: string;
  link_gmaps?: string;
  dados_ocorrencia: {
    os_id: number | string;
    oc_id?: number | string;
    protocolo: string;
    assunto?: string;
    descricao?: string;
    servico_prestado?: string;
    observacao?: string;
    data_agendamento?: string;
    data_cadastro?: string;
    tecnico?: string;
    link_rastreamento?: string;
    link_gmaps?: string;
  };
  dados_contrato: {
    cliente_id?: number | string;
    cliente_nome?: string;
    cpfcnpj?: string;
    contrato_id?: number | string;
    login?: string;
    plano?: string;
    endereco_completo?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    coordenadas?: string;
    celular_cliente?: string;
    link_rastreamento?: string;
    link_gmaps?: string;
  };
  dados_celular: {
    dispositivo_id?: string;
    dispositivo?: string | null;
    marca?: string | null;
    modelo?: string | null;
    sistema_operacional?: string | null;
    versao_so?: string | null;
    plataforma?: string | null;
    is_device?: boolean | null;
  };
  localizacao_tecnico?: {
    latitude?: number;
    longitude?: number;
    coordenadas?: string;
    link_rastreamento?: string;
    link_gmaps?: string;
  };
}

export interface FacialVerificationResult {
  sucesso: boolean;
  liberado: boolean;
  tecnico?: string;
  nome?: string;
  role?: string;
  mensagem?: string;
  debugInfo?: {
    statusHttp?: number;
    respostaServidor?: string;
    urlTestada?: string;
    erroDetalhado?: string;
  };
}

/**
 * Obtém o nome do técnico salvo na sessão local do aplicativo
 */
export const getLoggedTecnicoName = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LOGGED_TECNICO_KEY);
  } catch {
    return null;
  }
};

/**
 * Salva o nome do técnico na sessão local do aplicativo
 */
export const setLoggedTecnicoName = async (name: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LOGGED_TECNICO_KEY, name);
  } catch {}
};

export const LOGGED_USER_ROLE_KEY = '@logged_user_role';

/**
 * Obtém o cargo do usuário salvo na sessão (atendente vs tecnico)
 */
export const getLoggedUserRole = async (): Promise<string> => {
  try {
    return (await AsyncStorage.getItem(LOGGED_USER_ROLE_KEY)) || 'tecnico';
  } catch {
    return 'tecnico';
  }
};

/**
 * Salva o cargo do usuário na sessão (atendente vs tecnico)
 */
export const setLoggedUserRole = async (role: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LOGGED_USER_ROLE_KEY, role);
  } catch {}
};

/**
 * Encerra a sessão do técnico
 */
export const logoutLoggedTecnico = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LOGGED_TECNICO_KEY);
    await AsyncStorage.removeItem(LOGGED_USER_ROLE_KEY);
  } catch {}
};

export const DEVICE_ID_KEY = '@unique_device_id_v1';

/**
 * Gera ou recupera um identificador único persistente para cada dispositivo (UUID)
 */
export const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    let existingId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existingId) {
      return existingId;
    }
    const newId = `DEV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return `DEV-${Date.now().toString(36).toUpperCase()}`;
  }
};

/**
 * Envia código numérico (PIN do técnico) e dados do dispositivo para o webhook n8n:
 * POST https://n8n.zentos.com.br/webhook/reconhecimentofacil
 */
export const verifyNumericCodeSgp = async (
  numericCode: string,
  base64Image?: string
): Promise<FacialVerificationResult> => {
  let targetUrl = FACIAL_WEBHOOK_URL;
  let statusHttp = 0;
  let resText = '';

  try {
    const deviceId = await getRealHardwareDeviceId();
    const rawBase64 = base64Image ? base64Image.replace(/^data:image\/[a-z]+;base64,/, '') : '';
    const formattedBase64 = rawBase64 ? `data:image/jpeg;base64,${rawBase64}` : '';

    const payload = {
      codigo: numericCode.trim(),
      codigo_tecnico: numericCode.trim(),
      pin: numericCode.trim(),
      foto_base64: formattedBase64,
      timestamp: new Date().toISOString(),
      dispositivo_id: deviceId,
      android_id: deviceId,
      dispositivo: `${Device.brand || ''} ${Device.modelName || 'Celular Técnico'}`.trim(),
      dispositivo_marca: Device.brand || '',
      dispositivo_modelo: Device.modelName || '',
      dispositivo_so: `${Platform.OS} ${Device.osVersion || ''}`.trim(),
    };

    console.log(`[Numeric Login Webhook] Enviando código '${numericCode}' para ${FACIAL_WEBHOOK_URL}...`);

    let response: Response;
    try {
      response = await fetch(FACIAL_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      targetUrl = FACIAL_WEBHOOK_URL;
      statusHttp = response.status;

      // Se der 404 na rota de producao, tenta automaticamente a rota de TESTE do n8n
      if (response.status === 404) {
        const testUrl = 'https://n8n.zentos.com.br/webhook-test/reconhecimentofacil';
        targetUrl = testUrl;
        console.log(`[Numeric Login Webhook] 404 na produção. Tentando rota de teste do n8n: ${testUrl}...`);
        response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        statusHttp = response.status;
      }
    } catch (fetchErr: any) {
      const testUrl = 'https://n8n.zentos.com.br/webhook-test/reconhecimentofacil';
      targetUrl = testUrl;
      console.log(`[Numeric Login Webhook] Falha de conexão na produção. Tentando rota de teste: ${testUrl}...`);
      try {
        response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        statusHttp = response.status;
      } catch (err2: any) {
        return {
          sucesso: false,
          liberado: false,
          mensagem: 'Falha de rede/conexão com o servidor do n8n.',
          debugInfo: {
            urlTestada: testUrl,
            erroDetalhado: err2?.message || String(err2),
          },
        };
      }
    }

    resText = await response.text();
    console.log(`[Numeric Login Webhook] Resposta (${statusHttp}):`, resText);

    let data: any = {};
    try {
      data = JSON.parse(resText);
    } catch {
      data = {};
    }

    // Extrai o nome do técnico devolvido na resposta do webhook
    const tecnicoNome =
      data?.tecnico ||
      data?.nome ||
      data?.dados?.tecnico ||
      data?.dados?.nome ||
      (Array.isArray(data) && (data[0]?.tecnico || data[0]?.nome));

    const userRoleRaw =
      data?.role ||
      data?.cargo ||
      data?.tipo ||
      data?.funcao ||
      data?.perfil ||
      (data?.atendente === true ? 'atendente' : '') ||
      '';

    const userRoleStr = String(userRoleRaw).toLowerCase();
    const isAtendente = userRoleStr.includes('atend') || data?.atendente === true;
    const hasFinanceiro = userRoleStr.includes('finan') || data?.financeiro === true || data?.modulo_financeiro === true;

    let finalRole = 'tecnico';
    if (isAtendente && hasFinanceiro) {
      finalRole = 'atendente_financeiro';
    } else if (isAtendente) {
      finalRole = 'atendente';
    } else if (hasFinanceiro) {
      finalRole = 'tecnico_financeiro';
    }

    const isApproved =
      data?.liberado === true ||
      data?.sucesso === true ||
      data?.status === 'aprovado' ||
      data?.status === 'sucesso' ||
      Boolean(tecnicoNome);

    if (isApproved && tecnicoNome) {
      await setLoggedTecnicoName(tecnicoNome);
      await setLoggedUserRole(finalRole);
      return {
        sucesso: true,
        liberado: true,
        tecnico: tecnicoNome,
        nome: tecnicoNome,
        role: finalRole,
        mensagem: `Identidade confirmada! Bem-vindo, ${tecnicoNome}.`,
        debugInfo: {
          statusHttp,
          respostaServidor: resText,
          urlTestada: targetUrl,
        },
      };
    }

    if (response.ok && tecnicoNome) {
      await setLoggedTecnicoName(tecnicoNome);
      await setLoggedUserRole(finalRole);
      return {
        sucesso: true,
        liberado: true,
        tecnico: tecnicoNome,
        nome: tecnicoNome,
        role: finalRole,
        debugInfo: {
          statusHttp,
          respostaServidor: resText,
          urlTestada: targetUrl,
        },
      };
    }

    return {
      sucesso: false,
      liberado: false,
      mensagem: data?.mensagem || data?.erro || `Status ${statusHttp}: Código incorreto ou não liberado.`,
      debugInfo: {
        statusHttp,
        respostaServidor: resText,
        urlTestada: targetUrl,
      },
    };
  } catch (error: any) {
    console.warn('[Numeric Login Webhook] Erro:', error);
    return {
      sucesso: false,
      liberado: false,
      mensagem: 'Erro de exceção na requisição.',
      debugInfo: {
        urlTestada: targetUrl,
        erroDetalhado: error?.message || String(error),
      },
    };
  }
};

export const verifyFacialRecognitionSgp = async (input: string): Promise<FacialVerificationResult> => {
  return verifyNumericCodeSgp(input);
};

/**
 * Envia webhook para https://n8n.zentos.com.br/webhook/recebeconcluido
 * ao iniciar ou concluir um atendimento, incluindo o nome do técnico logado.
 */
export const sendAttendanceWebhook = async (
  status: 'iniciado' | 'concluido',
  chamado?: ChamadoItem,
  extra?: {
    servicoPrestado?: string;
    observacao?: string;
    coordsFormatted?: string;
    osId?: number;
    latitude?: number;
    longitude?: number;
    linkTracking?: string;
  }
): Promise<boolean> => {
  try {
    const osId = chamado?.os_id || extra?.osId || 0;
    const servico = chamado?.servicos?.[0];
    const loggedTecnicoName = await getLoggedTecnicoName();
    const nomeTecnicoFinal = loggedTecnicoName || chamado?.os_tecnico_responsavel || 'Técnico de Campo';

    const fullAddress = [
      chamado?.endereco_logradouro ? `${chamado.endereco_logradouro}, ${chamado.endereco_numero || 'SN'}` : '',
      chamado?.endereco_bairro ? `Bairro: ${chamado.endereco_bairro}` : '',
      chamado?.endereco_cidade ? `${chamado.endereco_cidade} - ${chamado.endereco_uf || ''}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    const protocoloStr = chamado?.oc_protocolo || '';

    const deviceId = await getRealHardwareDeviceId();

    const techLat = extra?.latitude;
    const techLng = extra?.longitude;
    const coordsStr = extra?.coordsFormatted || (techLat && techLng ? `${techLat},${techLng}` : undefined);
    
    const clientCoordsRaw = chamado?.contrato_endereco_ll;
    let clatParam = '';
    let clngParam = '';
    if (clientCoordsRaw) {
      const cParts = clientCoordsRaw.split(',');
      if (cParts.length === 2) {
        clatParam = `&clat=${cParts[0].trim()}`;
        clngParam = `&clng=${cParts[1].trim()}`;
      }
    }

    const tlatParam = techLat ? `&tlat=${techLat}` : '';
    const tlngParam = techLng ? `&tlng=${techLng}` : '';

    const n8nTrackingUrl = `https://n8n.zentos.com.br/webhook/rastrear-tecnico?os=${osId}${tlatParam}${tlngParam}${clatParam}${clngParam}`;
    const trackingLinkStr = (extra?.linkTracking && !extra.linkTracking.includes('google.com'))
      ? extra.linkTracking
      : n8nTrackingUrl;

    const payload: AttendanceWebhookPayload = {
      status,
      protocolo: protocoloStr,
      tecnico: nomeTecnicoFinal,
      dispositivo_id: deviceId,
      data_evento: new Date().toISOString(),
      link_rastreamento: trackingLinkStr,
      link_gmaps: trackingLinkStr,
      dados_ocorrencia: {
        os_id: osId,
        oc_id: chamado?.oc_id || osId,
        protocolo: protocoloStr,
        assunto: chamado?.oc_tipo_descricao || '',
        descricao: chamado?.os_conteudo || chamado?.oc_conteudo || '',
        servico_prestado: extra?.servicoPrestado || '',
        observacao: extra?.observacao || chamado?.os_observacao || '',
        data_agendamento: chamado?.os_data_agendamento || '',
        data_cadastro: chamado?.oc_data_cadastro || chamado?.os_data_cadastro || '',
        tecnico: nomeTecnicoFinal,
        link_rastreamento: trackingLinkStr,
        link_gmaps: trackingLinkStr,
      },
      dados_contrato: {
        cliente_id: chamado?.cliente_id,
        cliente_nome: chamado?.cliente || '',
        cpfcnpj: chamado?.cliente_cpfcnpj || '',
        contrato_id: chamado?.contrato_id,
        login: servico?.servico_login || '',
        plano: servico?.plano || '',
        endereco_completo: fullAddress,
        logradouro: chamado?.endereco_logradouro || '',
        numero: chamado?.endereco_numero || '',
        bairro: chamado?.endereco_bairro || '',
        cidade: chamado?.endereco_cidade || '',
        uf: chamado?.endereco_uf || '',
        coordenadas: coordsStr || chamado?.contrato_endereco_ll || '',
        celular_cliente: chamado?.cliente_contato || '',
        link_rastreamento: trackingLinkStr,
        link_gmaps: trackingLinkStr,
      },
      dados_celular: {
        dispositivo_id: deviceId,
        dispositivo: Device.deviceName || 'Celular Técnico SGP',
        marca: Device.brand || 'Android/iOS',
        modelo: Device.modelName || 'Mobile Device',
        sistema_operacional: Device.osName || Platform.OS,
        versao_so: Device.osVersion || '',
        plataforma: Platform.OS,
        is_device: Device.isDevice,
      },
      localizacao_tecnico: {
        latitude: techLat,
        longitude: techLng,
        coordenadas: coordsStr,
        link_rastreamento: trackingLinkStr,
        link_gmaps: trackingLinkStr,
      },
    };

    console.log(`[Webhook] Enviando notificação '${status}' (Técnico: ${nomeTecnicoFinal}) da O.S. #${osId} para ${WEBHOOK_URL}...`);

    let response: Response;
    try {
      response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        const testUrl = 'https://n8n.zentos.com.br/webhook-test/recebeconcluido';
        console.log(`[Webhook] 404 na produção. Tentando rota de teste do n8n: ${testUrl}...`);
        response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }
    } catch (e) {
      const testUrl = 'https://n8n.zentos.com.br/webhook-test/recebeconcluido';
      console.log(`[Webhook] Falha de conexão. Tentando rota de teste: ${testUrl}...`);
      response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    console.log(`[Webhook] Resposta do servidor (${response.status}):`, await response.text());
    return response.ok;
  } catch (error) {
    console.warn(`[Webhook] Erro ao enviar webhook '${status}':`, error);
    return false;
  }
};

export const LOCATION_TRACKING_WEBHOOK_URL = 'https://n8n.zentos.com.br/webhook/localizacaotecnico';

/**
 * Envia / Atualiza a localização no Supabase (tabela rastreamento_tecnico)
 */
export const upsertRastreamentoSupabase = async (payload: {
  os_id: string | number;
  tecnico: string;
  latitude: number;
  longitude: number;
  cliente_latitude?: number | null;
  cliente_longitude?: number | null;
  velocidade?: number | null;
}): Promise<boolean> => {
  try {
    const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/rastreamento_tecnico`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_CONFIG.key,
        'Authorization': `Bearer ${SUPABASE_CONFIG.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        os_id: String(payload.os_id),
        tecnico: payload.tecnico,
        latitude: payload.latitude,
        longitude: payload.longitude,
        cliente_latitude: payload.cliente_latitude ?? null,
        cliente_longitude: payload.cliente_longitude ?? null,
        velocidade: payload.velocidade ?? 0,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[Supabase Rastreamento Error]:', response.status, errText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Supabase Rastreamento Exception]:', error);
    return false;
  }
};

/**
 * Envia atualizações periódicas da localização GPS do técnico em tempo real para o Supabase e n8n
 * (enquanto a O.S. estiver em execução) para acompanhamento pelo cliente.
 */
export const sendTechnicianLocationTrackingWebhook = async (
  osId: number | string,
  lat: number,
  lng: number,
  chamado?: ChamadoItem,
  speedMps?: number | null
): Promise<boolean> => {
  try {
    const loggedTecnicoName = await getLoggedTecnicoName();
    const nomeTecnicoFinal = loggedTecnicoName || chamado?.os_tecnico_responsavel || 'Técnico de Campo';
    const coordsFormatted = `${lat},${lng}`;
    const linkTracking = `https://n8n.zentos.com.br/webhook/rastrear-tecnico?os=${osId}`;
    const deviceId = await getRealHardwareDeviceId();

    // Converte velocidade de m/s para km/h
    const velocidadeKmh = (speedMps && speedMps > 0) ? Math.round(speedMps * 3.6) : 0;

    // Extrai lat/lng do cliente caso disponível
    let clientLat: number | null = null;
    let clientLng: number | null = null;
    if (chamado?.contrato_endereco_ll) {
      const parts = chamado.contrato_endereco_ll.split(',');
      if (parts.length === 2) {
        const pLat = parseFloat(parts[0].trim());
        const pLng = parseFloat(parts[1].trim());
        if (!isNaN(pLat) && !isNaN(pLng)) {
          clientLat = pLat;
          clientLng = pLng;
        }
      }
    }

    // 1. Envia / Atualiza em tempo real no Supabase
    upsertRastreamentoSupabase({
      os_id: osId,
      tecnico: nomeTecnicoFinal,
      latitude: lat,
      longitude: lng,
      cliente_latitude: clientLat,
      cliente_longitude: clientLng,
      velocidade: velocidadeKmh,
    }).catch(() => {});

    // 2. Envia para o n8n como backup/legado
    const payload = {
      event: 'tecnico_localizacao_tempo_real',
      os_id: osId,
      oc_id: chamado?.oc_id || osId,
      protocolo: chamado?.oc_protocolo || '',
      tecnico: nomeTecnicoFinal,
      cliente_id: chamado?.cliente_id,
      cliente_nome: chamado?.cliente || '',
      contrato_id: chamado?.contrato_id,
      latitude: lat,
      longitude: lng,
      coordenadas: coordsFormatted,
      link_gmaps: linkTracking,
      link_rastreamento: linkTracking,
      data_atualizacao: new Date().toISOString(),
      dispositivo_id: deviceId,
    };

    let response: Response;
    try {
      response = await fetch(LOCATION_TRACKING_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        const testUrl = 'https://n8n.zentos.com.br/webhook-test/localizacaotecnico';
        response = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
    } catch {
      const testUrl = 'https://n8n.zentos.com.br/webhook-test/localizacaotecnico';
      response = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    return true;
  } catch (err) {
    console.warn('[Webhook] Erro ao enviar rastreamento de localização do técnico:', err);
    return false;
  }
};

export interface CreateOsWebhookPayload {
  protocolo: string;
  cliente: string;
  descricao: string;
  observacao?: string;
  bairro?: string;
  contratoId?: number | string;
  osId?: number | string;
  atendente?: string;
}

/**
 * Envia o webhook de Abertura de O.S. para https://n8n.zentos.com.br/webhook-test/recebeos
 * (com fallback para /webhook/recebeos) no formato formatado:
 *
 * 🚨 *OS Aberta!!*
 * 📋 *Protocolo:*
 * 👤 *Cliente:*
 * 📝 *Descrição:*
 * 📝 *Obs.:* (se houver)
 * 📍 *Local:* (bairro)
 */
export const sendCreateOsWebhook = async (data: CreateOsWebhookPayload): Promise<boolean> => {
  try {
    const loggedTecnicoName = await getLoggedTecnicoName();
    const atendenteFinal = data.atendente || loggedTecnicoName || 'Atendente';
    const hardwareId = await getRealHardwareDeviceId();

    const lines = [
      '🚨 *OS Aberta!!*',
      `📋 *Protocolo:* ${data.protocolo}`,
      `👤 *Cliente:* ${data.cliente}`,
      `📝 *Descrição:* ${data.descricao}`,
    ];

    if (data.observacao && data.observacao.trim().length > 0) {
      lines.push(`📝 *Obs.:* ${data.observacao.trim()}`);
    }

    lines.push(`📍 *Local:* ${data.bairro?.trim() || 'Não informado'}`);

    const mensagemFormatada = lines.join('\n');

    const payload = {
      mensagem: mensagemFormatada,
      protocolo: data.protocolo,
      cliente: data.cliente,
      descricao: data.descricao,
      observacao: data.observacao || '',
      bairro: data.bairro || '',
      atendente: atendenteFinal,
      contrato_id: data.contratoId,
      os_id: data.osId,
      dispositivo_id: hardwareId,
      timestamp: new Date().toISOString(),
    };

    const primaryUrl = 'https://n8n.zentos.com.br/webhook/recebeos';
    const fallbackUrl = 'https://n8n.zentos.com.br/webhook-test/recebeos';

    console.log('[Create OS Webhook] Enviando para n8n:', mensagemFormatada);

    try {
      let res = await fetch(primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        res = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      return res.ok;
    } catch {
      try {
        const resFallback = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return resFallback.ok;
      } catch {
        return false;
      }
    }
  } catch (error) {
    console.warn('[Create OS Webhook] Erro ao enviar webhook:', error);
    return false;
  }
};

export interface DespesaWebhookPayload {
  tipo: 'despesa' | 'abastecimento';
  descricao: string;
  valor: string;
  valorNumerico: number;
  comprovanteBase64?: string;
  data: string;
  usuario: string;
}

export const SUPABASE_CONFIG = {
  url: 'https://mtqkswikviiywcidnkwt.supabase.co',
  key: 'sb_publishable_9qRckOwvDZm6pqCrZeAozw_frGDglf0',
};

/**
 * Insere a despesa/abastecimento diretamente no Supabase
 */
export const insertDespesaSupabase = async (payload: {
  tipo: string;
  descricao: string;
  valor: number;
  comprovante_base64?: string;
  data_lancamento: string;
  usuario: string;
  dispositivo_id?: string;
}): Promise<boolean> => {
  try {
    const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/despesas`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_CONFIG.key,
        'Authorization': `Bearer ${SUPABASE_CONFIG.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[Supabase Insert Error]:', response.status, errText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Supabase Exception]:', error);
    return false;
  }
};

/**
 * Envia cadastro de despesa/abastecimento para o Supabase e Webhook n8n
 */
export const sendDespesasWebhook = async (data: DespesaWebhookPayload): Promise<boolean> => {
  try {
    const hardwareId = await getRealHardwareDeviceId();

    // 1. Envia para a tabela despesas no Supabase
    const payloadSupabase = {
      tipo: data.tipo,
      descricao: data.descricao,
      valor: data.valorNumerico,
      comprovante_base64: data.comprovanteBase64 || '',
      data_lancamento: data.data,
      usuario: data.usuario,
      dispositivo_id: hardwareId,
    };
    const supabaseOk = await insertDespesaSupabase(payloadSupabase);

    // 2. Envia para o Webhook n8n (com fallback)
    const payloadWebhook = {
      tipo: data.tipo,
      descricao: data.descricao,
      valor: data.valor,
      valor_numerico: data.valorNumerico,
      comprovante_base64: data.comprovanteBase64 || '',
      data: data.data,
      usuario: data.usuario,
      dispositivo_id: hardwareId,
      timestamp: new Date().toISOString(),
    };

    const primaryUrl = 'https://n8n.zentos.com.br/webhook/despesas';
    const fallbackUrl = 'https://n8n.zentos.com.br/webhook-test/despesas';

    try {
      let res = await fetch(primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWebhook),
      });

      if (!res.ok) {
        res = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadWebhook),
        });
      }
      return supabaseOk || res.ok;
    } catch {
      try {
        const resFallback = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadWebhook),
        });
        return supabaseOk || resFallback.ok;
      } catch {
        return supabaseOk;
      }
    }
  } catch (error) {
    console.warn('[Despesas Webhook/Supabase] Erro:', error);
    return false;
  }
};

export interface DespesaItemSupabase {
  id?: number;
  tipo: string;
  descricao: string;
  valor: number;
  comprovante_base64?: string;
  data_lancamento: string;
  usuario: string;
  dispositivo_id?: string;
  created_at?: string;
}

/**
 * Busca todas as despesas e abastecimentos cadastrados no Supabase
 */
export const fetchDespesasSupabase = async (): Promise<DespesaItemSupabase[]> => {
  try {
    const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/despesas?select=*&order=id.desc`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_CONFIG.key,
        'Authorization': `Bearer ${SUPABASE_CONFIG.key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('[Fetch Supabase Despesas HTTP Error]:', response.status);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('[Fetch Supabase Despesas Exception]:', error);
    return [];
  }
};
