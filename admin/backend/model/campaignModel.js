import { pool, query } from "../config/database.js";
import { CHANNELS, MESSAGE_STATUSES, PROGRESS } from "../config/marketing.js";

// Marketing campaigns (see config/marketing.js for the rules and config/campaignSender.js for the
// queue that sends them).
//
// campaigns          one row per message the hospital composes
// campaign_messages  one row per patient per channel: the address used, where it is in the
//                    queued -> sent -> delivered -> read ticks, and the provider's message id that
//                    delivery receipts (webhooks) are matched on
// campaign_receipts  receipts that arrived before we had saved the provider's id - possible because
//                    a provider can call the webhook before its own API call has returned to us.
//                    They are applied the moment the id is saved, so no tick is ever lost.

// Built on first use, not at import: config/marketing.js -> notifications.js -> database.js ->
// this file is an import cycle, so these lists may not exist yet while the modules are loading.
const sqlList = (values) => values.map((v) => `'${v}'`).join(",");
const progressArray = () => `ARRAY[${sqlList(PROGRESS)}]::text[]`;

export const createCampaignTables = async () => {
  const channelList = sqlList(CHANNELS);
  const statusList = sqlList(MESSAGE_STATUSES);
  await query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      channels TEXT[] NOT NULL,
      title TEXT,
      message TEXT NOT NULL,
      "mediaPath" TEXT,
      "mediaType" TEXT,
      "mediaName" TEXT,
      "whatsappMode" TEXT NOT NULL DEFAULT 'text' CHECK ("whatsappMode" IN ('text','template')),
      "whatsappTemplate" TEXT,
      "whatsappLanguage" TEXT,
      "whatsappParams" JSONB,
      "whatsappMediaId" TEXT,
      status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('scheduled','sending','completed','cancelled')),
      "scheduledAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "createdBy" INT REFERENCES admins(id) ON DELETE SET NULL,
      "startedAt" TIMESTAMPTZ,
      "completedAt" TIMESTAMPTZ,
      "cancelledAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS campaigns_due_idx ON campaigns ("scheduledAt") WHERE status = 'scheduled'`);

  // name / code / address are copied in when the campaign is made, so the history still reads
  // correctly after a patient is edited or removed (patientId then becomes NULL)
  await query(`
    CREATE TABLE IF NOT EXISTS campaign_messages (
      id SERIAL PRIMARY KEY,
      "campaignId" INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      "patientId" INT REFERENCES patients(id) ON DELETE SET NULL,
      "recipientName" TEXT,
      "recipientCode" TEXT,
      channel TEXT NOT NULL CHECK (channel IN (${channelList})),
      address TEXT,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (${statusList})),
      "providerId" TEXT,
      error TEXT,
      token TEXT NOT NULL UNIQUE,
      attempts INT NOT NULL DEFAULT 0,
      simulated BOOLEAN NOT NULL DEFAULT false,
      "sentAt" TIMESTAMPTZ,
      "deliveredAt" TIMESTAMPTZ,
      "readAt" TIMESTAMPTZ,
      "failedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS campaign_messages_campaign_idx ON campaign_messages ("campaignId", status)`);
  await query(`CREATE INDEX IF NOT EXISTS campaign_messages_provider_idx ON campaign_messages (channel, "providerId")`);
  await query(`CREATE INDEX IF NOT EXISTS campaign_messages_queue_idx ON campaign_messages (id) WHERE status IN ('queued','sending')`);

  await query(`
    CREATE TABLE IF NOT EXISTS campaign_receipts (
      id SERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      at TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS campaign_receipts_provider_idx ON campaign_receipts (channel, "providerId")`);
};

// ---- creating ----

// campaign = checked fields; messages = [{ patientId, name, code, channel, address, skip, token }]
// Everything goes in one transaction: a campaign never exists with half of its recipients.
export const insertCampaign = async (campaign, messages) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO campaigns (name, channels, title, message, "mediaPath", "mediaType", "mediaName", "whatsappMode",
         "whatsappTemplate", "whatsappLanguage", "whatsappParams", status, "scheduledAt", "createdBy", "startedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, now()), $14,
         CASE WHEN $12 = 'sending' THEN now() END)
       RETURNING *`,
      [
        campaign.name,
        campaign.channels,
        campaign.title,
        campaign.message,
        campaign.mediaPath,
        campaign.mediaType,
        campaign.mediaName,
        campaign.whatsappMode,
        campaign.whatsappTemplate,
        campaign.whatsappLanguage,
        campaign.whatsappParams ? JSON.stringify(campaign.whatsappParams) : null,
        campaign.status,
        campaign.scheduledAt,
        campaign.createdBy,
      ]
    );
    const created = rows[0];
    await client.query(
      `INSERT INTO campaign_messages ("campaignId", "patientId", "recipientName", "recipientCode", channel, address,
         status, error, token)
       SELECT $1::int, * FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])`,
      [
        created.id,
        messages.map((m) => m.patientId),
        messages.map((m) => m.name),
        messages.map((m) => m.code),
        messages.map((m) => m.channel),
        messages.map((m) => m.address),
        messages.map((m) => (m.skip ? "skipped" : "queued")),
        messages.map((m) => m.skip || null),
        messages.map((m) => m.token),
      ]
    );
    // a campaign where every message was skipped has nothing left to send
    await client.query(
      `UPDATE campaigns SET status = 'completed', "completedAt" = now()
       WHERE id = $1 AND status = 'sending'
         AND NOT EXISTS (SELECT 1 FROM campaign_messages WHERE "campaignId" = $1 AND status = 'queued')`,
      [created.id]
    );
    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ---- reading (admin panel) ----

// one count per status, so the panel can draw the tick summary
const countsSql = `
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status IN ('queued','sending'))::int AS queued,
    count(*) FILTER (WHERE status = 'sent')::int AS sent,
    count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
    count(*) FILTER (WHERE status = 'read')::int AS read,
    count(*) FILTER (WHERE status = 'failed')::int AS failed,
    count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
    count(DISTINCT "patientId")::int AS patients
  FROM campaign_messages m`;

export const findCampaigns = async () => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.channels, c.title, c."mediaType", c.status, c."scheduledAt", c."startedAt",
            c."completedAt", c."cancelledAt", c."createdAt", a.name AS "createdByName", to_jsonb(s) AS counts
     FROM campaigns c
     LEFT JOIN admins a ON a.id = c."createdBy"
     CROSS JOIN LATERAL (${countsSql} WHERE m."campaignId" = c.id) s
     ORDER BY c."createdAt" DESC
     LIMIT 500`
  );
  return rows;
};

export const findCampaignById = async (id) => {
  const { rows } = await query(
    `SELECT c.*, a.name AS "createdByName", to_jsonb(s) AS counts
     FROM campaigns c
     LEFT JOIN admins a ON a.id = c."createdBy"
     CROSS JOIN LATERAL (${countsSql} WHERE m."campaignId" = c.id) s
     WHERE c.id = $1`,
    [id]
  );
  const campaign = rows[0];
  if (!campaign) return null;
  const { rows: byChannel } = await query(
    `SELECT ch.name AS channel, to_jsonb(s) - 'patients' AS counts
     FROM unnest($2::text[]) AS ch(name)
     CROSS JOIN LATERAL (${countsSql} WHERE m."campaignId" = $1 AND m.channel = ch.name) s`,
    [id, campaign.channels]
  );
  campaign.byChannel = byChannel;
  return campaign;
};

// filters: { channel, status, search, limit, offset } (already checked by the controller)
export const findCampaignMessages = async (campaignId, f) => {
  const where = [`m."campaignId" = $1`];
  const params = [campaignId];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (f.channel) where.push(`m.channel = ${add(f.channel)}`);
  if (f.status === "queued") where.push(`m.status IN ('queued','sending')`);
  else if (f.status) where.push(`m.status = ${add(f.status)}`);
  if (f.search) {
    const like = add(`%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(m."recipientName" ILIKE ${like} OR m."recipientCode" ILIKE ${like} OR m.address ILIKE ${like})`);
  }
  const whereSql = where.join(" AND ");
  const n = params.length;
  const [{ rows }, { rows: total }] = await Promise.all([
    query(
      `SELECT m.id, m."patientId", m."recipientName", m."recipientCode", m.channel, m.address, m.status, m.error,
              m.simulated, m."sentAt", m."deliveredAt", m."readAt", m."failedAt", m."updatedAt"
       FROM campaign_messages m WHERE ${whereSql}
       ORDER BY m."recipientName", m.id
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...params, f.limit, f.offset]
    ),
    query(`SELECT count(*)::int AS count FROM campaign_messages m WHERE ${whereSql}`, params),
  ]);
  return { messages: rows, total: total[0].count };
};

// a scheduled or sending campaign stops: whatever has not gone out yet is skipped
export const cancelCampaign = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE campaigns SET status = 'cancelled', "cancelledAt" = now(), "updatedAt" = now()
       WHERE id = $1 AND status IN ('scheduled','sending') RETURNING id`,
      [id]
    );
    if (rows[0]) {
      await client.query(
        `UPDATE campaign_messages SET status = 'skipped', error = 'Campaign was cancelled', "updatedAt" = now()
         WHERE "campaignId" = $1 AND status = 'queued'`,
        [id]
      );
    }
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ---- the sending queue (config/campaignSender.js) ----

// scheduled campaigns whose time has come start sending
export const activateDueCampaigns = async () => {
  const { rowCount } = await query(
    `UPDATE campaigns SET status = 'sending', "startedAt" = now(), "updatedAt" = now()
     WHERE status = 'scheduled' AND "scheduledAt" <= now()`
  );
  return rowCount;
};

// A message left in "sending" means the server stopped in the middle of the provider call, so we
// can not know whether it went out. It is marked failed rather than retried, because a retry could
// send the patient the same message twice.
export const failInterruptedMessages = async () => {
  const { rowCount } = await query(
    `UPDATE campaign_messages
     SET status = 'failed', "failedAt" = now(), "updatedAt" = now(),
         error = 'Sending was interrupted (server restart) - not retried so the patient is never messaged twice'
     WHERE status = 'sending' AND "updatedAt" < now() - interval '10 minutes'`
  );
  return rowCount;
};

// Takes the next queued messages of running campaigns and marks them "sending" in the same
// statement. SKIP LOCKED keeps two server processes from ever taking the same message. Each row
// carries the patient's CURRENT consent, so a patient who unsubscribed after the campaign was
// scheduled is not messaged.
export const claimQueuedMessages = async (limit) => {
  const { rows } = await query(
    `WITH next AS (
       SELECT m.id FROM campaign_messages m
       JOIN campaigns c ON c.id = m."campaignId"
       WHERE m.status = 'queued' AND c.status = 'sending'
       ORDER BY m.id
       LIMIT $1
       FOR UPDATE OF m SKIP LOCKED
     )
     UPDATE campaign_messages m
     SET status = 'sending', attempts = m.attempts + 1, "updatedAt" = now()
     FROM next
     WHERE m.id = next.id
     RETURNING m.*,
       EXISTS (SELECT 1 FROM patients p WHERE p.id = m."patientId") AS "patientExists",
       COALESCE((SELECT p."marketingConsent" FROM patients p WHERE p.id = m."patientId"), false) AS "currentConsent"`,
    [limit]
  );
  return rows;
};

export const findCampaignForSending = async (id) => {
  const { rows } = await query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
  return rows[0];
};

// Meta media ids stay valid for 30 days, so a campaign uploads its media once
export const setCampaignWhatsappMediaId = async (id, mediaId) => {
  await query(`UPDATE campaigns SET "whatsappMediaId" = $2, "updatedAt" = now() WHERE id = $1`, [id, mediaId]);
};

// result: { status: sent | delivered | failed | skipped, providerId, error, simulated }
export const saveSendResult = async (id, result) => {
  const { rows } = await query(
    `UPDATE campaign_messages SET
       status = $2, "providerId" = $3, error = $4, simulated = $5, "updatedAt" = now(),
       "sentAt" = CASE WHEN $2 IN ('sent','delivered') THEN now() END,
       "deliveredAt" = CASE WHEN $2 = 'delivered' THEN now() END,
       "failedAt" = CASE WHEN $2 = 'failed' THEN now() END
     WHERE id = $1 AND status = 'sending'
     RETURNING id, channel, "providerId"`,
    [id, result.status, result.providerId || null, result.error ? String(result.error).slice(0, 500) : null, Boolean(result.simulated)]
  );
  return rows[0];
};

// running campaigns with nothing left in the queue are done
export const completeFinishedCampaigns = async () => {
  const { rowCount } = await query(
    `UPDATE campaigns c SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
     WHERE c.status = 'sending'
       AND NOT EXISTS (SELECT 1 FROM campaign_messages m WHERE m."campaignId" = c.id AND m.status IN ('queued','sending'))`
  );
  return rowCount;
};

// ---- delivery receipts (webhooks, email opens, app inbox reads) ----

// Moves the ticks of the message the provider calls `providerId`. Same rule as shouldApplyStatus()
// in config/marketing.js, written in SQL so two receipts arriving together can not race:
// progress only moves forward, and "failed" only lands on a message not yet delivered.
const applySql = () => `
  UPDATE campaign_messages SET
    status = $3,
    "sentAt" = CASE WHEN $3 IN ('sent','delivered','read') THEN COALESCE("sentAt", $5) ELSE "sentAt" END,
    "deliveredAt" = CASE WHEN $3 IN ('delivered','read') THEN COALESCE("deliveredAt", $5) ELSE "deliveredAt" END,
    "readAt" = CASE WHEN $3 = 'read' THEN COALESCE("readAt", $5) ELSE "readAt" END,
    "failedAt" = CASE WHEN $3 = 'failed' THEN $5 ELSE "failedAt" END,
    error = CASE WHEN $3 = 'failed' THEN $4 ELSE error END,
    "updatedAt" = now()
  WHERE channel = $1 AND "providerId" = $2
    AND status NOT IN ('failed','skipped')
    AND (
      ($3 = 'failed' AND status IN ('sending','sent'))
      OR ($3 <> 'failed' AND array_position(${progressArray()}, $3) > array_position(${progressArray()}, status))
    )`;

// receipt: { channel, providerId, status, error, at }. Returns true when the message is known.
export const applyReceipt = async ({ channel, providerId, status, error, at }) => {
  const params = [channel, providerId, status, error ? String(error).slice(0, 500) : null, at || new Date()];
  const { rowCount } = await query(applySql(), params);
  if (rowCount) return true;
  // known message, receipt just older than what we have -> nothing to do
  const { rows } = await query(`SELECT 1 FROM campaign_messages WHERE channel = $1 AND "providerId" = $2 LIMIT 1`, [
    channel,
    providerId,
  ]);
  if (rows[0]) return true;
  // not known (yet): keep it until saveSendResult stores this providerId
  await query(`INSERT INTO campaign_receipts (channel, "providerId", status, error, at) VALUES ($1, $2, $3, $4, $5)`, params);
  return false;
};

// right after a providerId is saved: apply whatever receipts beat us to it, oldest first
export const applyEarlyReceipts = async (channel, providerId) => {
  const { rows } = await query(
    `DELETE FROM campaign_receipts WHERE channel = $1 AND "providerId" = $2 RETURNING status, error, at`,
    [channel, providerId]
  );
  rows.sort((a, b) => new Date(a.at) - new Date(b.at));
  for (const r of rows) await query(applySql(), [channel, providerId, r.status, r.error, r.at]);
};

// Safety net run by every sender tick: a receipt can be stored a moment AFTER applyEarlyReceipts
// looked (the webhook checked, found nothing, and saved it while we were saving the id). Any stored
// receipt whose message is now known is applied here.
export const applyMatchedReceipts = async () => {
  const { rows } = await query(
    `DELETE FROM campaign_receipts r USING campaign_messages m
     WHERE m.channel = r.channel AND m."providerId" = r."providerId"
     RETURNING r.channel, r."providerId", r.status, r.error, r.at`
  );
  rows.sort((a, b) => new Date(a.at) - new Date(b.at));
  for (const r of rows) await query(applySql(), [r.channel, r.providerId, r.status, r.error, r.at]);
  return rows.length;
};

// receipts for messages we never sent (other WhatsApp traffic on the same number) are dropped after a day
export const pruneOldReceipts = async () => {
  await query(`DELETE FROM campaign_receipts WHERE "createdAt" < now() - interval '1 day'`);
};

// email: the tracking image loaded -> read (email has no separate "delivered" receipt)
export const markEmailOpened = async (token) => {
  await query(
    `UPDATE campaign_messages SET status = 'read', "readAt" = COALESCE("readAt", now()),
       "deliveredAt" = COALESCE("deliveredAt", now()), "updatedAt" = now()
     WHERE token = $1 AND channel = 'email' AND status IN ('sent','delivered')`,
    [token]
  );
};

export const findMessageByToken = async (token) => {
  const { rows } = await query(`SELECT id, "patientId", channel FROM campaign_messages WHERE token = $1`, [token]);
  return rows[0];
};

// app inbox: the patient opened the notification(s) -> blue ticks
export const markAppMessagesRead = async (notificationIds) => {
  if (!notificationIds.length) return;
  await query(
    `UPDATE campaign_messages SET status = 'read', "readAt" = COALESCE("readAt", now()), "updatedAt" = now()
     WHERE channel = 'app' AND "providerId" = ANY($1::text[]) AND status IN ('sent','delivered')`,
    [notificationIds.map(String)]
  );
};

// the doctor / specialty filters of the audience page
export const findAudienceDoctors = async () => {
  const { rows } = await query(`SELECT id, name, specialty FROM doctors ORDER BY name`);
  return rows;
};
