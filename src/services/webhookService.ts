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
}

export interface FacialVerificationResult {
  sucesso: boolean;
  liberado: boolean;
  tecnico?: string;
  nome?: string;
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

/**
 * Encerra a sessão do técnico
 */
export const logoutLoggedTecnico = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LOGGED_TECNICO_KEY);
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

    const isApproved =
      data?.liberado === true ||
      data?.sucesso === true ||
      data?.status === 'aprovado' ||
      data?.status === 'sucesso' ||
      Boolean(tecnicoNome);

    if (isApproved && tecnicoNome) {
      await setLoggedTecnicoName(tecnicoNome);
      return {
        sucesso: true,
        liberado: true,
        tecnico: tecnicoNome,
        nome: tecnicoNome,
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
      return {
        sucesso: true,
        liberado: true,
        tecnico: tecnicoNome,
        nome: tecnicoNome,
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

    const payload: AttendanceWebhookPayload = {
      status,
      protocolo: protocoloStr,
      tecnico: nomeTecnicoFinal,
      dispositivo_id: deviceId,
      data_evento: new Date().toISOString(),
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
        coordenadas: extra?.coordsFormatted || chamado?.contrato_endereco_ll || '',
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
