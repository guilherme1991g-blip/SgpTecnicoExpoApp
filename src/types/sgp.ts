export interface ServicoItem {
  servico_login?: string;
  servico_ip?: string;
  servico_mac?: string;
  servico_password?: string;
  plano?: string;
  servico_online?: boolean;
  servico_online_ip?: string;
  servico_online_mac?: string;

  // Diagnostico ONU / FTTH da OLT SGP
  onu_rx_power?: number;
  onu_tx_power?: number;
  onu_olt_rx_power?: number;
  onu_uptime?: string;
  onu_status?: string;
  onu_phase_state?: string;
  onu_template?: string;
  onu_last_read?: string;
  servico_onu_serial?: string;
  hasOnuData?: boolean;
  historico_conexoes?: HistoricoConexaoItem[];

  // Dados FTTX avancados da OLT (GET /api/fttx/onu/{id}/info/)
  onu_distance?: string;
  onu_attenuation?: string;
  onu_last_offline_cause?: string;
  onu_last_offline_time?: string;
  onu_online_duration?: string;
  logsOnu?: OnuLogItem[];
}

export interface OnuLogItem {
  id?: string;
  inicio?: string;
  fim?: string;
  causa?: string;
  dataInicio?: string;
  causaOriginal?: string;
  causaTraduzida?: string;
  duracao?: string;
}

export interface HistoricoConexaoItem {
  data: string;
  evento: string;
  ip?: string;
  status: 'online' | 'offline' | 'alerta';
}

export interface ChamadoItem {
  os_id: number | string;
  oc_id: number | string;
  oc_protocolo: string;
  oc_tipo_id?: number | string;
  oc_tipo_descricao?: string;
  oc_data_cadastro: string;
  oc_data_encerramento?: string;
  oc_conteudo: string;
  oc_status: number;
  oc_status_descricao?: string;

  os_conteudo?: string;
  os_servicoprestado?: string;
  os_observacao?: string;
  os_data_cadastro?: string;
  os_data_agendamento?: string;
  os_data_finalizacao?: string;
  os_motivo_id?: number | string;
  os_motivo_descricao?: string;
  os_status?: number;
  os_status_descricao?: string;
  os_tecnico_responsavel?: string;

  cliente: string;
  cliente_id?: number | string;
  contrato_id?: number | string;
  contrato_pop?: string;
  contrato_endereco_ll?: string;
  contrato_status_data?: string;

  // Credenciais da Central do Assinante SGP
  cliente_cpfcnpj?: string;
  cliente_senha?: string;

  // Dados de Endereço e Contato Reais do SGP
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_uf?: string;
  endereco_complemento?: string;
  endereco_pontoreferencia?: string;
  cliente_contato?: string;

  servicos?: ServicoItem[];
}

export interface OnuDetailInfo {
  serialOnu?: string;
  tempoAtivo?: string;
  sinalDownloadRx?: number;
  sinalUploadTx?: number;
  sinalOltRx?: number;
  statusOnu?: string;
  phaseState?: string;
  ctoPorta?: string;
  templateOnu?: string;
  ultimaLeitura?: string;
  distanciaFibra?: string;
  atenuacaoFibra?: string;
  causaUltimaQueda?: string;
  dataUltimaQueda?: string;
  logsOnu?: OnuLogItem[];
}
