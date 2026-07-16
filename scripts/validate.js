// Validates data/trip.json against schema/trip.schema.json.
// Run directly (`npm run validate`) or imported by scripts/build.js.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

export function validateTrip() {
  const schema = JSON.parse(readFileSync(path.join(root, 'schema/trip.schema.json'), 'utf8'));
  const data = JSON.parse(readFileSync(path.join(root, 'data/trip.json'), 'utf8'));

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data);

  if (!valid) {
    const message = validateFn.errors
      .map((e) => `  ${e.instancePath || '(root)'} ${e.message}`)
      .join('\n');
    throw new Error(`data/trip.json failed schema validation:\n${message}`);
  }

  return data;
}

// Allow `node scripts/validate.js` to run standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    validateTrip();
    console.log('✅ data/trip.json is valid.');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
