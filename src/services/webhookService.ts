import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ChamadoItem } from './sgpApi';

export const WEBHOOK_URL = 'https://n8n.zentos.com.br/webhook-test/recebeconcluido';

export interface AttendanceWebhookPayload {
  status: 'iniciado' | 'concluido' | 'em_atendimento' | 'encerrado';
  protocolo: string;
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

/**
 * Envia webhook para https://n8n.zentos.com.br/webhook/recebeconcluido
 * ao iniciar ou concluir um atendimento.
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

    console.log(`[Webhook] Enviando notificação '${status}' da O.S. #${osId} para ${WEBHOOK_URL}...`);

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
