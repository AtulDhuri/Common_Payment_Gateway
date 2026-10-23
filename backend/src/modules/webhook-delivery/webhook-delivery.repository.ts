// FILE: modules/webhook-delivery/webhook-delivery.repository.ts
// PURPOSE: DB access for webhook_configs and webhook_events. Claiming uses FOR UPDATE SKIP LOCKED so several backend instances never send the same delivery at once
// DEPENDENCIES: typeorm DataSource, entities
// PHASE: 8
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DeliveryStatus } from './entities/webhook-event.entity';
import { WebhookConfig } from './entities/webhook-config.entity';

export interface ClaimedDelivery {
  id: string;
  tenantId: string;
  paymentId: string;
  eventType: string;
  requestPayload: Record<string, unknown>;
  attemptCount: number;
}

export interface DeliveryListItem {
  id: string;
  paymentId: string;
  eventType: string;
  status: DeliveryStatus;
  attemptCount: number;
  responseCode: number | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
}

interface ClaimRow {
  id: string;
  tenant_id: string;
  payment_id: string;
  event_type: string;
  request_payload: Record<string, unknown>;
  attempt_count: number;
}

interface ListRow {
  id: string;
  payment_reference: string;
  event_type: string;
  delivery_status: DeliveryStatus;
  attempt_count: number;
  response_code: number | null;
  last_attempt_at: Date | null;
  next_attempt_at: Date | null;
  created_at: Date;
}

@Injectable()
export class WebhookDeliveryRepository {
  constructor(
    @InjectRepository(WebhookConfig) private readonly configs: Repository<WebhookConfig>,
    private readonly dataSource: DataSource,
  ) {}

  findConfig(tenantId: string): Promise<WebhookConfig | null> {
    return this.configs.findOne({ where: { tenantId } });
  }

  saveConfig(config: WebhookConfig): Promise<WebhookConfig> {
    return this.configs.save(config);
  }

  createConfig(values: Partial<WebhookConfig>): WebhookConfig {
    return this.configs.create(values);
  }

  /**
   * Takes up to `limit` due deliveries and pushes their next_attempt_at forward by `leaseSeconds`. If the process dies
   * before recording a result, the delivery simply becomes due again after the lease.
   */
  async claimDue(limit: number, leaseSeconds: number): Promise<ClaimedDelivery[]> {
    const rows: ClaimRow[] = await this.dataSource.query(
      `WITH due AS (
         SELECT id FROM webhook_events
         WHERE delivery_status = 'PENDING' AND next_attempt_at <= now()
         ORDER BY next_attempt_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
       UPDATE webhook_events w SET next_attempt_at = now() + make_interval(secs => $2)
       FROM due WHERE w.id = due.id
       RETURNING w.id, w.tenant_id, w.payment_id, w.event_type, w.request_payload, w.attempt_count`,
      [limit, leaseSeconds],
    );
    // UPDATE ... RETURNING comes back as [rows, count] on some pg versions via TypeORM
    const list = Array.isArray(rows[0]) ? (rows[0] as unknown as ClaimRow[]) : rows;
    return list.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      paymentId: r.payment_id,
      eventType: r.event_type,
      requestPayload: r.request_payload,
      attemptCount: r.attempt_count,
    }));
  }

  /** Records the result of one attempt. Only touches rows that are still PENDING. */
  async recordAttempt(
    id: string,
    status: DeliveryStatus,
    responseCode: number | null,
    endpointUrl: string,
    retryInSeconds: number | null,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE webhook_events SET
         attempt_count = attempt_count + 1,
         last_attempt_at = now(),
         response_code = $2,
         endpoint_url = $3,
         delivery_status = $4::text,
         next_attempt_at = CASE WHEN $4::text = 'PENDING' THEN now() + make_interval(secs => $5::double precision) ELSE NULL END
       WHERE id = $1 AND delivery_status = 'PENDING'`,
      [id, responseCode, endpointUrl, status, retryInSeconds ?? 0],
    );
  }

  /** Marks a delivery FAILED without sending (no active endpoint any more). */
  async failWithoutSending(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE webhook_events SET delivery_status = 'FAILED', next_attempt_at = NULL, last_attempt_at = now()
       WHERE id = $1 AND delivery_status = 'PENDING'`,
      [id],
    );
  }

  async listForTenant(tenantId: string, page: number, limit: number): Promise<[DeliveryListItem[], number]> {
    const rows: ListRow[] = await this.dataSource.query(
      `SELECT w.id, p.payment_reference, w.event_type, w.delivery_status, w.attempt_count, w.response_code,
              w.last_attempt_at, w.next_attempt_at, w.created_at
       FROM webhook_events w JOIN payments p ON p.id = w.payment_id
       WHERE w.tenant_id = $1
       ORDER BY w.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, (page - 1) * limit],
    );
    const total = Number((await this.dataSource.query('SELECT count(*)::int AS n FROM webhook_events WHERE tenant_id = $1', [tenantId]))[0].n);
    return [
      rows.map((r) => ({
        id: r.id,
        paymentId: r.payment_reference,
        eventType: r.event_type,
        status: r.delivery_status,
        attemptCount: r.attempt_count,
        responseCode: r.response_code,
        lastAttemptAt: r.last_attempt_at,
        nextAttemptAt: r.next_attempt_at,
        createdAt: r.created_at,
      })),
      total,
    ];
  }
}
