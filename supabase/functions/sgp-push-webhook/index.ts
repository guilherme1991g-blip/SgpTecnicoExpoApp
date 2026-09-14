import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // Corrige se o SGP anexar um segundo '?' ou '%3F' na URL em vez de '&'
    let reqUrlStr = req.url;
    const parts = reqUrlStr.split(/\?|%3[fF]/);
    if (parts.length > 2) {
      reqUrlStr = parts[0] + "?" + parts.slice(1).join("&");
    }

    const url = new URL(reqUrlStr);

    // 1. Extrai da URL Query String (ex: ?to=5587...&msg=...) enviado pelo SGP
    let queryTo = url.searchParams.get("to") || url.searchParams.get("phone") || url.searchParams.get("celular") || url.searchParams.get("telefone") || "";
    let queryMsg = url.searchParams.get("msg") || url.searchParams.get("mensagem") || url.searchParams.get("texto") || url.searchParams.get("conteudo") || "";

    // 2. Extrai do Body (JSON ou Form Data)
    let bodyObj: any = {};
    try {
      bodyObj = await req.json();
    } catch (_) {
      try {
        const formData = await req.formData();
        bodyObj = Object.fromEntries(formData.entries());
      } catch (__) {
        bodyObj = {};
      }
    }

    const rawTo = String(queryTo || bodyObj.to || bodyObj.phone || bodyObj.celular || bodyObj.telefone || bodyObj.destinatario || "");
    const msg = String(queryMsg || bodyObj.msg || bodyObj.mensagem || bodyObj.texto || bodyObj.conteudo || bodyObj.body || "");

    console.log("Recebido do SGP - Telefone (to):", rawTo, "| Mensagem (msg):", msg);

    if (!rawTo && !msg) {
      return new Response(JSON.stringify({ error: "Parâmetros 'to' ou 'msg' ausentes." }), { status: 400 });
    }

    // 3. Limpeza do telefone (ex: 558765908765 -> 8765908765)
    let cleanPhone = rawTo.replace(/\D/g, "");
    let phoneWithout55 = cleanPhone.startsWith("55") && cleanPhone.length >= 12 
      ? cleanPhone.substring(2) 
      : cleanPhone;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 4. Limpeza automática de notificações com mais de 7 dias
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("notificacoes_historico").delete().lt("created_at", sevenDaysAgo);
    } catch (cleanErr) {
      console.log("Aviso ao apagar mensagens antigas:", cleanErr);
    }

    // 5. Grava no histórico de notificações do Supabase com título "Aviso"
    const { error: insertErr } = await supabase.from("notificacoes_historico").insert({
      telefone: phoneWithout55 || cleanPhone || "geral",
      telefone_completo: cleanPhone || "geral",
      titulo: "Aviso",
      mensagem: msg,
    });

    if (insertErr) {
      console.error("Erro ao salvar histórico:", insertErr.message);
    } else {
      console.log("Notificação salva no histórico com sucesso para:", phoneWithout55);
    }

    // 6. Busca o Push Token na tabela push_tokens
    let records: any[] = [];
    if (phoneWithout55) {
      const { data } = await supabase
        .from("push_tokens")
        .select("push_token")
        .or(`telefone.eq.${phoneWithout55},telefone_completo.eq.${cleanPhone},telefone.eq.${cleanPhone},cpf.eq.${cleanPhone}`);

      records = data || [];
    }

    // Fallback: Busca por ID de contrato se houver na mensagem
    if (records.length === 0 && msg) {
      const matchContrato = msg.match(/(?:contrato|contrat)[\s#]*(\d+)/i);
      if (matchContrato) {
        const cId = parseInt(matchContrato[1], 10);
        const { data: cRecords } = await supabase.from("push_tokens").select("push_token").eq("contrato_id", cId);
        if (cRecords && cRecords.length > 0) {
          records = cRecords;
        }
      }
    }

    if (records.length === 0) {
      console.log(`Salvo no histórico. Nenhum push_token ativo encontrado para o telefone: ${phoneWithout55}`);
      return new Response(JSON.stringify({ status: "salvo_sem_token", phone: phoneWithout55 }), { status: 200 });
    }

    // 7. Dispara o Push para a API oficial do Expo com título "Aviso"
    const envios = records.map((rec) =>
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: rec.push_token,
          title: "Aviso",
          body: msg,
          sound: "default",
        }),
      })
    );

    await Promise.all(envios);

    return new Response(JSON.stringify({ status: "sucesso", enviados: records.length }), { status: 200 });

  } catch (err) {
    console.error("Erro geral na Edge Function:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
