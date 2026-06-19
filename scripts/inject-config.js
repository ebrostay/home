#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  // Load .env if running locally
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Create a .env file or set them as environment variables.');
  process.exit(1);
}

const template = fs.readFileSync(path.join(__dirname, '..', 'supabase-config.template.js'), 'utf8');
const output = template
  .replace('__SUPABASE_URL__', supabaseUrl)
  .replace('__SUPABASE_ANON_KEY__', supabaseKey);

fs.writeFileSync(path.join(__dirname, '..', 'supabase-config.js'), output);
console.log('supabase-config.js generated.');
