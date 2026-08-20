import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChamadoItem } from './sgpApi';

export const WEBHOOK_URL = 'https://n8n.zentos.com.br/webhook/recebeconcluido';
export const FACIAL_WEBHOOK_URL = 'https://n8n.zentos.com.br/webhook/reconhecimentofacial';
export const LOGGED_TECNICO_KEY = '@logged_tecnico_name';

export interface AttendanceWebhookPayload {
  status: 'iniciado' | 'concluido' | 'em_atendimento' | 'encerrado';
  protocolo: string;
  tecnico?: string;
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
    dispositivo?: string | null;
    marca?: string | null;
    modelo?: string | null;
    sistema_operacional?: string;
    versao_so?: string | null;
    plataforma?: string;
    is_device?: boolean;
  };
}

export interface FacialVerificationResult {
  sucesso: boolean;
  liberado: boolean;
  tecnico?: string;
  nome?: string;
  mensagem?: string;
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

/**
 * Envia selfie capturada ao vivo (base64) para o webhook de reconhecimento facial n8n:
 * POST https://n8n.zentos.com.br/webhook/reconhecimentofacial
 */
export const verifyFacialRecognitionSgp = async (
  base64Image: string
): Promise<FacialVerificationResult> => {
  try {
    const formattedBase64 = base64Image.startsWith('data:')
      ? base64Image
      : `data:image/jpeg;base64,${base64Image}`;

    const payload = {
      foto_base64: formattedBase64,
      timestamp: new Date().toISOString(),
      dispositivo: `${Device.brand || ''} ${Device.modelName || 'Celular Técnico'}`.trim(),
    };

    console.log(`[Facial Webhook] Enviando selfie para ${FACIAL_WEBHOOK_URL}...`);

    const response = await fetch(FACIAL_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const resText = await response.text();
    console.log(`[Facial Webhook] Resposta (${response.status}):`, resText);

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
      };
    }

    if (response.ok && tecnicoNome) {
      await setLoggedTecnicoName(tecnicoNome);
      return {
        sucesso: true,
        liberado: true,
        tecnico: tecnicoNome,
        nome: tecnicoNome,
      };
    }

    return {
      sucesso: false,
      liberado: false,
      mensagem: data?.mensagem || data?.erro || 'Reconhecimento facial não autorizado.',
    };
  } catch (error) {
    console.warn('[Facial Webhook] Erro:', error);
    return {
      sucesso: false,
      liberado: false,
      mensagem: 'Erro de comunicação com o serviço de reconhecimento facial.',
    };
  }
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

    const payload: AttendanceWebhookPayload = {
      status,
      protocolo: protocoloStr,
      tecnico: nomeTecnicoFinal,
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

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log(`[Webhook] Resposta do servidor (${response.status}):`, await response.text());
    return response.ok;
  } catch (error) {
    console.warn(`[Webhook] Erro ao enviar webhook '${status}':`, error);
    return false;
  }
};
