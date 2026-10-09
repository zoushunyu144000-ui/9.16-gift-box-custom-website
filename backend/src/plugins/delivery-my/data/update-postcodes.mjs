// Rebuilds postcodes.json from data.gov.my's official postcode table ("Postcodes in Malaysia",
// https://data.gov.my/data-catalogue/poskod, CC BY 4.0). The table is updated about once a year.
//
//   node src/plugins/delivery-my/data/update-postcodes.mjs --as-of=2026-06              (downloads it)
//   node src/plugins/delivery-my/data/update-postcodes.mjs --as-of=2026-06 postcodes.csv (a file you downloaded)
//
// --as-of is the "Data as of" date shown on the catalogue page. Then run the tests (npm test): they check
// that Kuala Lumpur and Selangor still sit on the postcode prefixes the zones were checked against.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSV_URL = 'https://storage.data.gov.my/dictionaries/postcodes.csv';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'postcodes.json');

const args = process.argv.slice(2);
const asOf = args.find(a => a.startsWith('--as-of='))?.slice('--as-of='.length);
const file = args.find(a => !a.startsWith('--'));
if (!asOf || !/^\d{4}-\d{2}$/.test(asOf)) {
    console.error('Give the "Data as of" month from https://data.gov.my/data-catalogue/poskod, e.g. --as-of=2026-06');
    process.exit(1);
}

const csv = file ? readFileSync(file, 'utf8') : await download(CSV_URL);
const rows = parseCsv(csv);
const header = rows.shift()?.map(h => h.trim().toLowerCase());
const col = name => {
    const i = header?.indexOf(name) ?? -1;
    if (i < 0) throw new Error(`The table has no "${name}" column (columns: ${header?.join(', ')}).`);
    return i;
};
const [stateCol, cityCol, postcodeCol] = [col('state'), col('city'), col('postcode')];

/** state → city → postcodes. Names are trimmed: the 2026 table has "Negeri Sembilan  " and "Bestari Jaya ". */
const states = new Map();
let kept = 0;
for (const row of rows) {
    const state = row[stateCol]?.trim();
    const city = row[cityCol]?.trim().replace(/\s+/g, ' ');
    const postcode = row[postcodeCol]?.trim();
    if (!state || !city || !/^\d{5}$/.test(postcode ?? '')) throw new Error(`Unexpected row: ${JSON.stringify(row)}`);
    const cities = states.get(state) ?? new Map();
    const postcodes = cities.get(city) ?? new Set();
    if (!postcodes.has(postcode)) kept++;
    postcodes.add(postcode);
    cities.set(city, postcodes);
    states.set(state, cities);
}

const byName = (a, b) => a[0].localeCompare(b[0], 'en');
const lines = [...states.entries()].sort(byName).map(([state, cities]) => {
    const cityLines = [...cities.entries()]
        .sort(byName)
        .map(([city, postcodes]) => `      ${JSON.stringify(city)}: ${JSON.stringify([...postcodes].sort())}`);
    return `    ${JSON.stringify(state)}: {\n${cityLines.join(',\n')}\n    }`;
});
const meta = {
    source: 'Postcodes in Malaysia, data.gov.my: https://data.gov.my/data-catalogue/poskod',
    file: CSV_URL,
    dataAsOf: asOf,
    converted: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()),
    license: 'Creative Commons Attribution 4.0 (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/',
    changes: 'Grouped by state and city; extra spaces trimmed from names; repeated rows dropped. No postcodes were added or changed.',
};
const json = `{\n${Object.entries(meta)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')}\n  "states": {\n${lines.join(',\n')}\n  }\n}\n`;
JSON.parse(json); // must stay valid JSON
writeFileSync(OUT, json);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${kept} postcode entries in ${states.size} states, from ${rows.length} rows.`);

async function download(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.text();
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
function parseCsv(text) {
    const out = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            if (row.some(f => f !== '')) out.push(row);
            row = [];
            field = '';
        } else field += c;
    }
    row.push(field);
    if (row.some(f => f !== '')) out.push(row);
    return out;
}
