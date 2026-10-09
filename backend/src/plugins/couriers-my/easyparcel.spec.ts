import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    EasyParcelApi,
    EasyParcelOAuth,
    EasyParcelQuotation,
    labelUrlFor,
    parseEasyParcelTime,
    pickQuotation,
    toSen,
    tokensFromResponse,
} from './clients/easyparcel';
import { parseEasyParcelWebhook } from './clients/easyparcel-webhook';
import { buildParcel, buildSubmitShipment, defaultCollectionDate, easyParcelParty, formatAddress, ParcelDataError } from './parcel';

const quote = (serviceId: string, courier: string, service: string, total: number | string, pickup = true): EasyParcelQuotation => ({
    courier: { service_id: serviceId, service_name: service, courier_name: courier, is_pickup: pickup, is_dropoff: !pickup },
    pricing: { currency: 'MYR', total_amount: total },
});
const quotes = [
    quote('EP-CS0D9', 'City-Link Express', 'City-Link Express (Pick Up)', '9.80'),
    quote('EP-CS096', 'Aramex', 'Aramex (Pick Up)', 12.31),
    quote('EP-CS0JT', 'J&T Express', 'J&T Express (Drop-Off)', 6.5, false),
    quote('EP-CS0PL', 'Pos Laju', 'Pos Laju (Pick Up)', '8.90'),
];

describe('choosing an EasyParcel service', () => {
    it('picks the cheapest service that matches the collection method', () => {
        const result = pickQuotation(quotes, 'cheapest', 'pickup');
        assert.ok('quotation' in result && result.quotation.courier.service_id === 'EP-CS0PL');
        const anyMethod = pickQuotation(quotes, undefined, 'any');
        assert.ok('quotation' in anyMethod && anyMethod.quotation.courier.service_id === 'EP-CS0JT');
    });

    it('accepts an exact service id or a courier name', () => {
        const exact = pickQuotation(quotes, 'ep-cs096', 'pickup');
        assert.ok('quotation' in exact && exact.quotation.courier.courier_name === 'Aramex');
        const named = pickQuotation(quotes, 'city-link', 'pickup');
        assert.ok('quotation' in named && named.quotation.courier.service_id === 'EP-CS0D9');
    });

    it('explains what is available when the choice is not offered', () => {
        const result = pickQuotation(quotes, 'GDex', 'pickup');
        assert.ok('error' in result && /GDex/.test(result.error) && /Pos Laju \(Pick Up\) \(EP-CS0PL\) RM 8\.90/.test(result.error));
        assert.ok('error' in pickQuotation(quotes, 'EP-CS999', 'pickup'));
        assert.ok('error' in pickQuotation([], 'cheapest', 'pickup'));
    });

    it('reads prices given as numbers or strings', () => {
        assert.equal(toSen('12.31'), 1231);
        assert.equal(toSen(6.5), 650);
        assert.equal(toSen(''), undefined);
    });
});

describe('EasyParcel payload mapping', () => {
    const shop = {
        fullName: 'Moire Co.',
        company: 'Moire Co.',
        streetLine1: 'Jalan Ampang',
        city: 'Kuala Lumpur',
        province: 'Kuala Lumpur',
        postalCode: '50450',
        countryCode: 'MY',
        phoneNumber: '03-1234 5678',
    };
    const recipient = {
        fullName: 'Tan Mei Ling',
        streetLine1: '12 Lorong Kampung Jawa',
        streetLine2: 'Taman Bayan',
        city: 'Bayan Lepas',
        province: 'Penang',
        postalCode: '11950',
        countryCode: 'MY',
        phoneNumber: '+60 12-345 6789',
    };

    it('builds sender and receiver with national phone numbers and ISO subdivision codes', () => {
        assert.deepEqual(easyParcelParty('receiver', recipient), {
            name: 'Tan Mei Ling',
            phone_number_country_code: 'MY',
            phone_number: '123456789',
            address_1: '12 Lorong Kampung Jawa',
            address_2: 'Taman Bayan',
            postcode: '11950',
            city: 'Bayan Lepas',
            subdivision_code: 'MY-07',
            country_code: 'MY',
        });
        const sender = easyParcelParty('sender', shop);
        assert.equal(sender.subdivision_code, 'MY-14');
        assert.equal(sender.phone_number, '312345678');
        assert.equal(sender.company, 'Moire Co.');
    });

    it('fills the state from the postcode and refuses addresses a courier cannot use', () => {
        assert.equal(easyParcelParty('receiver', { ...recipient, province: '' }).subdivision_code, 'MY-07');
        assert.equal(easyParcelParty('receiver', { ...recipient, province: 'Sarawak', postalCode: '93350' }).subdivision_code, 'MY-13');
        assert.throws(() => easyParcelParty('receiver', { ...recipient, phoneNumber: '' }), ParcelDataError);
        assert.throws(() => easyParcelParty('receiver', { ...recipient, province: 'Atlantis', postalCode: '00000' }), ParcelDataError);
    });

    it('builds the submit_orders shipment from the parcel and the chosen service', () => {
        const parcel = buildParcel(
            [
                { name: 'Spring Blessings Box', quantity: 2, unitPriceSen: 18800, weightGrams: 1500, lengthCm: 30, widthCm: 25, heightCm: 12 },
                { name: 'Personalised name', quantity: 3, unitPriceSen: 800, weightGrams: 0, lengthCm: 10, widthCm: 5, heightCm: 1 },
            ],
            { weightKg: 1, lengthCm: 30, widthCm: 25, heightCm: 15 },
        );
        assert.equal(parcel.weightKg, 3);
        assert.deepEqual([parcel.lengthCm, parcel.widthCm, parcel.heightCm], [30, 25, 27]);
        const shipment = buildSubmitShipment({
            serviceId: 'EP-CS0PL',
            collectionDate: '2026-10-09',
            reference: 'ABC123',
            parcel,
            sender: easyParcelParty('sender', shop),
            receiver: easyParcelParty('receiver', recipient),
        });
        assert.equal(shipment.service_id, 'EP-CS0PL');
        assert.equal(shipment.collection_date, '2026-10-09');
        assert.equal(shipment.weight, 3);
        assert.deepEqual(shipment.item[0], { content: 'Spring Blessings Box', weight: 1.5, length: 30, width: 25, height: 12, currency_code: 'MYR', value: 188, quantity: 2 });
        assert.equal(shipment.item[1].weight, 0.01);
        assert.deepEqual(shipment.feature, { sms_tracking: false, email_tracking: false, whatsapp_tracking: false });
        assert.equal(shipment.receiver.subdivision_code, 'MY-07');
    });

    it('uses the default box when variants have no weights, and what staff enter over both', () => {
        const parcel = buildParcel([{ name: 'Hamper', quantity: 1, unitPriceSen: 23800 }], { weightKg: 2, lengthCm: 40, widthCm: 30, heightCm: 20 });
        assert.deepEqual([parcel.weightKg, parcel.lengthCm, parcel.widthCm, parcel.heightCm], [2, 40, 30, 20]);
        const packed = buildParcel([{ name: 'Hamper', quantity: 1, unitPriceSen: 23800 }], { weightKg: 2, lengthCm: 40, widthCm: 30, heightCm: 20 }, { weightKg: 3.456, heightCm: 35 });
        assert.deepEqual([packed.weightKg, packed.heightCm], [3.46, 35]);
    });

    it('formats the address for couriers and the geocoder', () => {
        assert.equal(formatAddress(recipient), '12 Lorong Kampung Jawa, Taman Bayan, 11950 Bayan Lepas, Penang, Malaysia');
        assert.equal(formatAddress({ ...shop, province: 'Kuala Lumpur', city: 'Kuala Lumpur' }), 'Jalan Ampang, 50450 Kuala Lumpur, Kuala Lumpur, Malaysia');
    });

    it('collects today in Malaysia, or Monday instead of Sunday', () => {
        assert.equal(defaultCollectionDate(new Date('2026-10-09T02:00:00Z')), '2026-10-09'); // Friday
        assert.equal(defaultCollectionDate(new Date('2026-10-09T17:00:00Z')), '2026-10-10'); // Saturday 1am MYT
        assert.equal(defaultCollectionDate(new Date('2026-10-11T03:00:00Z')), '2026-10-12'); // Sunday → Monday
    });

    it('chooses the label size, defaulting thermal printers to A6', () => {
        const submitted = {
            awb_url: 'https://app.easyparcel.com/portal/v2/public/label/ES-2602-VC4KV/3972206?format=A4',
            awb_urls_by_format: { A4: 'https://x/label?format=A4', A5: '', A6: 'https://x/label?format=A6' },
        };
        assert.equal(labelUrlFor(submitted, 'A6'), 'https://x/label?format=A6');
        assert.equal(labelUrlFor(submitted, 'A5'), 'https://app.easyparcel.com/portal/v2/public/label/ES-2602-VC4KV/3972206?format=A5');
        assert.equal(labelUrlFor({ awb_url: 'https://s3/consignment.pdf' }, 'A6'), 'https://s3/consignment.pdf');
    });

    it('reads tracking times', () => {
        assert.equal(parseEasyParcelTime('2026-01-23 12:29:47')?.toISOString(), '2026-01-23T12:29:47.000Z');
        assert.equal(parseEasyParcelTime('2026-01-23T04:28:52.494Z')?.toISOString(), '2026-01-23T04:28:52.494Z');
        assert.equal(parseEasyParcelTime(''), undefined);
    });
});

describe('EasyParcel webhooks', () => {
    it('reads only the shipment identifiers and makes a stable key per delivery', () => {
        const body = JSON.stringify({
            topic: 'shipment.awb.update',
            shipment_number: 'ES-2504-G7FDF',
            uuid: 'webhook-test-uuid-123',
            timestamp: '2017-10-28 11:40:00',
            awb_number: '23872512999',
        });
        const event = parseEasyParcelWebhook(body);
        assert.equal(event?.topic, 'shipment.awb.update');
        assert.equal(event?.shipmentNumber, 'ES-2504-G7FDF');
        assert.equal(event?.awbNumber, '23872512999');
        assert.equal(parseEasyParcelWebhook(body)?.eventKey, event?.eventKey);
        const other = parseEasyParcelWebhook(body.replace('shipment.awb.update', 'shipment.tracking.update'));
        assert.notEqual(other?.eventKey, event?.eventKey);
    });

    it('copes with the invalid JSON of the documented tracking sample', () => {
        const sample = `{
            "topic": "shipment.tracking.update",
            "shipment_number": "ES-2504-G7FDF",
            "uuid": "webhook-test-uuid-123",
            "awb_number": "238725129086",
            "latest_shipment_status_code":5,
            "status_log":[ "0":{ "timestamp":"2017-10-28 11:40:00" } ]
        }`;
        const event = parseEasyParcelWebhook(sample);
        assert.equal(event?.topic, 'shipment.tracking.update');
        assert.equal(event?.shipmentNumber, 'ES-2504-G7FDF');
        assert.equal(event?.awbNumber, '238725129086');
    });

    it('ignores bodies without a shipment', () => {
        assert.equal(parseEasyParcelWebhook(''), undefined);
        assert.equal(parseEasyParcelWebhook('{"topic":"shipment.status.update"}'), undefined);
    });
});

describe('EasyParcel OAuth and API', () => {
    it('sends the merchant to the authorise URL with PKCE', () => {
        const oauth = new EasyParcelOAuth({ baseUrl: 'https://api.easyparcel.com', clientId: 'client-1', clientSecret: 's' });
        const url = new URL(oauth.authorizeUrl({ redirectUri: 'https://shop/delivery/easyparcel/oauth/callback', state: 'st', codeChallenge: 'ch' }));
        assert.equal(url.origin + url.pathname, 'https://api.easyparcel.com/oauth/login');
        assert.equal(url.searchParams.get('client_id'), 'client-1');
        assert.equal(url.searchParams.get('response_type'), 'code');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(url.searchParams.get('redirect_uri'), 'https://shop/delivery/easyparcel/oauth/callback');
    });

    it('exchanges the code with HTTP Basic client authentication', async () => {
        let seen: { headers: Record<string, string>; body: string } | undefined;
        const oauth = new EasyParcelOAuth({
            baseUrl: 'https://api.easyparcel.com',
            clientId: 'client-1',
            clientSecret: 'secret-1',
            fetch: async (_url, init) => {
                seen = { headers: init?.headers as Record<string, string>, body: init?.body as string };
                return new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 36000, access_token: 'at', refresh_token: 'rt' }));
            },
        });
        const tokens = await oauth.exchangeCode({ code: 'c0de', redirectUri: 'https://shop/cb', codeVerifier: 'v' });
        assert.equal(tokens.accessToken, 'at');
        assert.equal(seen?.headers.Authorization, `Basic ${Buffer.from('client-1:secret-1').toString('base64')}`);
        const form = new URLSearchParams(seen?.body);
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('code_verifier'), 'v');
    });

    it('reads token responses, wrapped or not', () => {
        const now = Date.parse('2026-10-09T00:00:00Z');
        const plain = tokensFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600, refresh_token_expires_at: '2027-10-09T00:00:00Z' }, now);
        assert.equal(plain?.expiresAt?.toISOString(), '2026-10-09T01:00:00.000Z');
        assert.equal(plain?.refreshTokenExpiresAt?.toISOString(), '2027-10-09T00:00:00.000Z');
        const wrapped = tokensFromResponse({ status_code: 200, data: { access_token: 'b', expires_at: '2026-10-09T10:00:00Z' } }, now);
        assert.equal(wrapped?.accessToken, 'b');
        assert.equal(tokensFromResponse({ error: 'invalid_grant' }, now), undefined);
    });

    it('refreshes the token once on a 401 and retries', async () => {
        const tokensAsked: boolean[] = [];
        const authHeaders: string[] = [];
        const api = new EasyParcelApi({
            baseUrl: 'https://api.easyparcel.com',
            apiVersion: '2026-09',
            accessToken: async refresh => {
                tokensAsked.push(refresh);
                return refresh ? 'fresh' : 'stale';
            },
            fetch: async (url, init) => {
                authHeaders.push((init?.headers as Record<string, string>).Authorization);
                assert.equal(url, 'https://api.easyparcel.com/open_api/2026-09/shipment/tracking_status');
                if (authHeaders.length === 1) return new Response('{"message":"Unauthenticated."}', { status: 401 });
                return new Response(JSON.stringify({ status_code: 200, data: { results: [{ status: 'success', awb_number: '1', latest_shipment_status_code: 5 }] } }));
            },
        });
        const results = await api.trackingStatus(['1']);
        assert.equal(results[0].latest_shipment_status_code, 5);
        assert.deepEqual(tokensAsked, [false, true]);
        assert.deepEqual(authHeaders, ['Bearer stale', 'Bearer fresh']);
    });

    it('batches tracking requests to 50 AWBs', async () => {
        const sizes: number[] = [];
        const api = new EasyParcelApi({
            baseUrl: 'https://api.easyparcel.com',
            apiVersion: '2026-09',
            accessToken: async () => 't',
            fetch: async (_url, init) => {
                sizes.push(JSON.parse(init?.body as string).awb_numbers.length);
                return new Response(JSON.stringify({ data: { results: [] } }));
            },
        });
        await api.trackingStatus(Array.from({ length: 120 }, (_, i) => String(i)));
        assert.deepEqual(sizes, [50, 50, 20]);
    });
});
