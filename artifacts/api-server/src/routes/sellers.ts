import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const MVP_TENANT = "00000000-0000-0000-0000-000000000001";

// Painel comparativo de vendedores: tempo de resposta (mediana, horário
// comercial SP), conversas/dia (contatos distintos) e pendências (conversas
// cuja última mensagem é do cliente). Uma linha por vendedor + linha "Time".
router.get("/sellers", async (req: AuthedRequest, res) => {
  const days = Math.min(
    Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1),
    365,
  );
  try {
    const { rows } = await pool.query(
      `
      with msgs as (
        select whatsapp_owner, chat_id, direction, message_created_at
        from whatsapp_messages
        where chat_type = 'private'
          and message_created_at >= now() - ($1::int * interval '1 day')
      ),
      seq as (
        select whatsapp_owner, chat_id, direction, message_created_at,
               lag(direction)          over w as prev_dir,
               lag(message_created_at) over w as prev_ts
        from msgs
        window w as (partition by whatsapp_owner, chat_id order by message_created_at)
      ),
      resp as (
        select whatsapp_owner,
               extract(epoch from (message_created_at - prev_ts)) / 60.0 as min
        from seq
        where direction = 'outbound' and prev_dir = 'inbound'
          and extract(isodow from (prev_ts at time zone 'America/Sao_Paulo')) between 1 and 5
          and extract(hour   from (prev_ts at time zone 'America/Sao_Paulo')) between 8 and 17
      ),
      resp_owner as (
        select whatsapp_owner, percentile_cont(0.5) within group (order by min) as tempo
        from resp group by whatsapp_owner
      ),
      dia as (
        select whatsapp_owner,
               (message_created_at at time zone 'America/Sao_Paulo')::date as d,
               count(distinct chat_id) as contatos
        from msgs group by whatsapp_owner, d
      ),
      conv_owner as (
        select whatsapp_owner, avg(contatos) as conversas_dia from dia group by whatsapp_owner
      ),
      ult as (
        select distinct on (whatsapp_owner, chat_id) whatsapp_owner, direction
        from msgs order by whatsapp_owner, chat_id, message_created_at desc
      ),
      pend_owner as (
        select whatsapp_owner, count(*) filter (where direction = 'inbound') as pendencias
        from ult group by whatsapp_owner
      ),
      linhas as (
        select a.owner_phone as phone, a.display_name as vendedor,
               round(coalesce(r.tempo, 0)::numeric, 1)         as tempo_resp_min,
               round(coalesce(c.conversas_dia, 0)::numeric, 1) as conversas_dia,
               coalesce(p.pendencias, 0)::int                  as pendencias, 1 as ord
        from whatsapp_accounts a
        left join resp_owner r on r.whatsapp_owner = a.owner_phone
        left join conv_owner c on c.whatsapp_owner = a.owner_phone
        left join pend_owner p on p.whatsapp_owner = a.owner_phone
        where a.active = true and a.tenant_id = $2
        union all
        select null, 'Time (todos)',
               round(coalesce((select percentile_cont(0.5) within group (order by min) from resp), 0)::numeric, 1),
               round(coalesce((select sum(conversas_dia) from conv_owner), 0)::numeric, 1),
               coalesce((select sum(pendencias) from pend_owner), 0)::int, 0
      )
      select phone, vendedor, tempo_resp_min, conversas_dia, pendencias
      from linhas order by ord, pendencias desc
      `,
      [days, MVP_TENANT],
    );
    res.json({ days, rows });
  } catch {
    res.status(500).json({ error: "sellers_failed" });
  }
});

export default router;
