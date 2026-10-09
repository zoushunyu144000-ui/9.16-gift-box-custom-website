/**
 * Phone numbers as customers type them ("012-345 6789", "+6012 3456789", "60123456789") → E.164,
 * which Lalamove requires (^\+[1-9]\d{1,14}$). Numbers without a country code are taken as Malaysian.
 */
export function toE164(phone: string | null | undefined, defaultCallingCode = '60'): string | undefined {
    const raw = (phone ?? '').trim();
    if (!raw) return undefined;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return undefined;
    let e164: string;
    if (raw.startsWith('+')) e164 = `+${digits}`;
    else if (digits.startsWith('00')) e164 = `+${digits.slice(2)}`;
    else if (digits.startsWith(defaultCallingCode) && digits.length >= 10) e164 = `+${digits}`;
    else if (digits.startsWith('0')) e164 = `+${defaultCallingCode}${digits.slice(1)}`;
    else e164 = `+${defaultCallingCode}${digits}`;
    return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : undefined;
}

/** Calling code → ISO 3166-1 country, for the countries a Malaysian shop's customers mostly use. */
const CALLING_CODES: Array<[string, string]> = [
    ['673', 'BN'],
    ['852', 'HK'],
    ['60', 'MY'],
    ['65', 'SG'],
    ['62', 'ID'],
    ['66', 'TH'],
    ['63', 'PH'],
    ['84', 'VN'],
    ['86', 'CN'],
    ['61', 'AU'],
    ['44', 'GB'],
    ['1', 'US'],
];

/**
 * EasyParcel wants the phone's country and the national number without the trunk 0
 * (its docs: country "MY", number "1126760658" for +60 11-2676 0658).
 */
export function easyParcelPhone(phone: string | null | undefined): { countryCode: string; number: string } | undefined {
    const e164 = toE164(phone);
    if (!e164) return undefined;
    const digits = e164.slice(1);
    const match = CALLING_CODES.find(([code]) => digits.startsWith(code));
    if (!match) return undefined;
    return { countryCode: match[1], number: digits.slice(match[0].length) };
}
