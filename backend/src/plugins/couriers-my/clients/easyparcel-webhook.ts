import { sha256Hex } from '../crypto';

/** Topics this plugin acts on (EasyParcel Developer Hub → App → Webhook). */
export const EASYPARCEL_SHIPMENT_TOPICS = ['shipment.status.update', 'shipment.tracking.update', 'shipment.awb.update', 'shipment.created'];

export interface EasyParcelWebhookEvent {
    topic: string;
    shipmentNumber?: string;
    awbNumber?: string;
    /** Same delivery → same key, so retried webhooks are processed once. */
    eventKey: string;
}

/**
 * EasyParcel webhooks carry no signature, so nothing in the body is trusted: only the shipment number
 * and AWB are read, to know which shipment to re-fetch from the API. The documented samples are not
 * always valid JSON (the tracking sample has `"0": {…}` inside an array), so when parsing fails the
 * identifiers are picked out of the text.
 */
export function parseEasyParcelWebhook(rawBody: string): EasyParcelWebhookEvent | undefined {
    const text = rawBody.trim();
    if (!text) return undefined;
    let body: Record<string, unknown> | undefined;
    try {
        const parsed = JSON.parse(text);
        body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
        body = undefined;
    }
    const field = (name: string): string | undefined => {
        const value = body ? body[name] : text.match(new RegExp(`"${name}"\\s*:\\s*"([^"\\\\]{1,100})"`))?.[1];
        return typeof value === 'string' || typeof value === 'number' ? String(value).trim() || undefined : undefined;
    };
    const topic = field('topic') ?? (field('shipment_number') && /"sender_name"/.test(text) ? 'shipment.created' : 'unknown');
    const shipmentNumber = field('shipment_number');
    const awbNumber = field('awb_number');
    if (!shipmentNumber && !awbNumber) return undefined;
    const uuid = field('uuid');
    const when = field('timestamp') ?? field('event_date') ?? '';
    const status = field('shipment_status_code') ?? field('latest_shipment_status_code') ?? '';
    // The uuid identifies a delivery, but the documented samples reuse one uuid across topics and shipments.
    const eventKey = `easyparcel:${sha256Hex([topic, uuid ?? '', shipmentNumber ?? '', awbNumber ?? '', when, status].join('|')).slice(0, 40)}`;
    return { topic, shipmentNumber, awbNumber, eventKey };
}
