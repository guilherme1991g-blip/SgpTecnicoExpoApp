import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRealHardwareDeviceId } from './webhookService';

export const SUPABASE_CONFIG = {
  url: 'https://mtqkswikviiywcidnkwt.supabase.co',
  key: 'sb_publishable_9qRckOwvDZm6pqCrZeAozw_frGDglf0',
};

export const TENANT_SESSION_KEY = '@vegasync_tenant_session_v2';
export const SAVED_COMPANY_CODE_KEY = '@vegasync_saved_company_code_v1';

export interface TenantMenus {
  criarOs: boolean;
  consultaClientes: boolean;
  clientesOffline: boolean;
  autorizarOnu: boolean;
  consultarOlt: boolean;
  financeiro: boolean;
}

export const DEFAULT_MENUS: TenantMenus = {
  criarOs: true,
  consultaClientes: true,
  clientesOffline: true,
  autorizarOnu: true,
  consultarOlt: true,
  financeiro: true,
};

export interface TenantSession {
  empresaId: string;
  codigoEmpresa: string;
  nomeEmpresa: string;
  sgpUrl: string;
  sgpApp: string;
  sgpToken: string;
  webhookAtendimentoUrl?: string;
  webhookAberturaOsUrl?: string;
  webhookDespesasUrl?: string;
  webhookRastreamentoUrl?: string;
  tecnicoId: string;
  tecnicoNome: string;
  tecnicoCodigo: string;
  tecnicoCargo?: string;
  tecnicoRole: string;
  dispositivoId: string;
  menus: TenantMenus;
  loggedAt: string;
}

export interface TenantLoginResult {
  sucesso: boolean;
  mensagem: string;
  session?: TenantSession;
  debugInfo?: any;
}

/**
 * Recupera o código da última empresa utilizada no dispositivo
 */
export const getSavedCompanyCode = async (): Promise<string> => {
  try {
    const code = await AsyncStorage.getItem(SAVED_COMPANY_CODE_KEY);
    return code ? code.trim().toUpperCase() : 'VEGA01';
  } catch {
    return 'VEGA01';
  }
};

/**
 * Salva o código da empresa preferencial
 */
export const setSavedCompanyCode = async (code: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(SAVED_COMPANY_CODE_KEY, code.trim().toUpperCase());
  } catch {}
};

/**
 * Recupera a sessão ativa da empresa e técnico
 */
export const getTenantSession = async (): Promise<TenantSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(TENANT_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as TenantSession;
    if (!session.menus) {
      session.menus = { ...DEFAULT_MENUS };
    }
    return session;
  } catch {
    return null;
  }
};

/**
 * Salva a sessão ativa multi-tenant
 */
export const saveTenantSession = async (session: TenantSession): Promise<void> => {
  try {
    await AsyncStorage.setItem(TENANT_SESSION_KEY, JSON.stringify(session));
    if (session.codigoEmpresa) {
      await setSavedCompanyCode(session.codigoEmpresa);
    }
  } catch (err) {
    console.warn('Erro ao salvar tenant session:', err);
  }
};

/**
 * Limpa a sessão ativa (Logout)
 */
export const logoutTenantSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TENANT_SESSION_KEY);
  } catch {}
};

/**
 * Autentica o técnico consultando a tabela `empresas` e `tecnicos` no Supabase
 */
export const authenticateWithSupabase = async (
  codigoEmpresaInput: string,
  codigoFuncionarioInput: string
): Promise<TenantLoginResult> => {
  const codigoEmpresa = codigoEmpresaInput.trim().toUpperCase();
  const codigoFuncionario = codigoFuncionarioInput.trim();

  if (!codigoEmpresa) {
    return {
      sucesso: false,
      mensagem: 'Por favor, informe o Código da Empresa.',
    };
  }

  if (!codigoFuncionario) {
    return {
      sucesso: false,
      mensagem: 'Por favor, digite seu PIN / Código de Acesso.',
    };
  }

  try {
    const deviceId = await getRealHardwareDeviceId();

    let empresa = null;
    try {
      const empresaEndpoint = `${SUPABASE_CONFIG.url}/rest/v1/empresas?codigo_empresa=ilike.${encodeURIComponent(
        codigoEmpresa
      )}&ativo=eq.true&select=*`;

      const empresaResp = await fetch(empresaEndpoint, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_CONFIG.key,
          Authorization: `Bearer ${SUPABASE_CONFIG.key}`,
          'Content-Type': 'application/json',
        },
      });

      if (empresaResp.ok) {
        const empresasData = await empresaResp.json();
        if (Array.isArray(empresasData) && empresasData.length > 0) {
          empresa = empresasData[0];
        }
      }
    } catch (e) {
      console.warn('Erro ao consultar tabela empresas do Supabase:', e);
    }

    // Se a empresa não for encontrada no Supabase ou tabela vazia:
    if (!empresa) {
      return {
        sucesso: false,
        mensagem: `Empresa com o código "${codigoEmpresa}" não foi encontrada no banco de dados.`,
      };
    }

    // 2. Busca o Técnico vinculado a esta Empresa
    const tecnicoEndpoint = `${SUPABASE_CONFIG.url}/rest/v1/tecnicos?empresa_id=eq.${encodeURIComponent(
      empresa.id
    )}&codigo_funcionario=eq.${encodeURIComponent(codigoFuncionario)}&ativo=eq.true&select=*`;

    const tecnicoResp = await fetch(tecnicoEndpoint, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_CONFIG.key,
        Authorization: `Bearer ${SUPABASE_CONFIG.key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!tecnicoResp.ok) {
      const errTxt = await tecnicoResp.text();
      return {
        sucesso: false,
        mensagem: 'Erro ao validar credenciais do funcionário.',
        debugInfo: { status: tecnicoResp.status, errTxt },
      };
    }

    const tecnicosData = await tecnicoResp.json();
    if (!Array.isArray(tecnicosData) || tecnicosData.length === 0) {
      return {
        sucesso: false,
        mensagem: `Código de acesso "${codigoFuncionario}" não confere com nenhum funcionário ativo na empresa ${empresa.nome_empresa}.`,
      };
    }

    const tecnico = tecnicosData[0];

    // 3. Atualiza o dispositivo_id do técnico em segundo plano
    try {
      fetch(`${SUPABASE_CONFIG.url}/rest/v1/tecnicos?id=eq.${tecnico.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_CONFIG.key,
          Authorization: `Bearer ${SUPABASE_CONFIG.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          dispositivo_id: deviceId,
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {}

    // 4. Resolve permissões de menu com base na Empresa e no Perfil (Role)
    // Regra padronizada:
    // - Base: Menus habilitados no cadastro da empresa
    // - Administrador (admin): Abre todos os menus que estão selecionados na empresa
    // - Técnico (tecnico): Abre todos os habilitados na empresa, MENOS criar OS e financeiro
    // - Atendente (atendente): Abre todos os habilitados na empresa (com restrição interna no recebimento)
    const empHabilitado = (empVal: any): boolean => {
      return empVal !== null && empVal !== undefined ? Boolean(empVal) : true;
    };

    const roleNorm = String(tecnico.role || 'tecnico').toLowerCase();
    const isAdmin = roleNorm.includes('admin') || roleNorm === 'administrador';
    const isTecnico = roleNorm.includes('tecnico') || roleNorm === 'campo';
    // Se for técnico explícito (e não admin), bloqueia criarOs e financeiro
    const podeCriarOs = (isAdmin || !isTecnico) && empHabilitado(empresa.menu_criar_os);
    const podeFinanceiro = (isAdmin || !isTecnico) && empHabilitado(empresa.menu_financeiro);

    const menus: TenantMenus = {
      criarOs: podeCriarOs,
      consultaClientes: empHabilitado(empresa.menu_consulta_clientes),
      clientesOffline: empHabilitado(empresa.menu_clientes_offline),
      autorizarOnu: empHabilitado(empresa.menu_autorizar_onu),
      consultarOlt: empHabilitado(empresa.menu_consultar_olt),
      financeiro: podeFinanceiro,
    };

    // 5. Monta a sessão estruturada
    const session: TenantSession = {
      empresaId: empresa.id,
      codigoEmpresa: empresa.codigo_empresa,
      nomeEmpresa: empresa.nome_empresa,
      sgpUrl: empresa.sgp_url ? empresa.sgp_url.replace(/\/+$/, '') : 'https://webcnnect.sgp.tsmx.com.br',
      sgpApp: empresa.sgp_app || 'App',
      sgpToken: empresa.sgp_token || '9720002b-a4f6-4c48-9a20-65f86669f6d6',
      webhookAtendimentoUrl: empresa.webhook_atendimento_url || 'https://n8n.zentos.com.br/webhook/recebeconcluido',
      webhookAberturaOsUrl: empresa.webhook_abertura_os_url || 'https://n8n.zentos.com.br/webhook/aberturaos',
      webhookDespesasUrl: empresa.webhook_despesas_url || 'https://n8n.zentos.com.br/webhook/despesas',
      webhookRastreamentoUrl: empresa.webhook_rastreamento_url || 'https://n8n.zentos.com.br/webhook/localizacaotecnico',
      tecnicoId: tecnico.id,
      tecnicoNome: tecnico.nome,
      tecnicoCodigo: tecnico.codigo_funcionario,
      tecnicoCargo: tecnico.cargo || 'Técnico de Campo',
      tecnicoRole: tecnico.role || 'tecnico',
      dispositivoId: deviceId,
      menus,
      loggedAt: new Date().toISOString(),
    };

    // 6. Salva a sessão localmente no aparelho
    await saveTenantSession(session);

    return {
      sucesso: true,
      mensagem: `Bem-vindo, ${tecnico.nome}!`,
      session,
    };
  } catch (error: any) {
    console.error('[Supabase Auth Exception]:', error);
    return {
      sucesso: false,
      mensagem: 'Falha de comunicação com o banco de dados. Verifique a internet.',
      debugInfo: { error: error?.message || String(error) },
    };
  }
};
