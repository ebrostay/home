// Supabase connection settings.
// Fill these two values from your Supabase project:
// Project Settings -> API -> Project URL and "anon public" key.
// The anon key is safe to publish: all permissions are enforced by
// Row Level Security policies in the database (see supabase/schema.sql).
//
// While these are empty the website keeps working with the built-in
// sample data from data.js.
//
// IMPORTANT: this committed default points at the STAGING project, not
// production. It is the fallback used whenever config isn't injected — i.e.
// CI test runs and local `npx playwright test`. Keeping it on staging means an
// accidental live backend hit during testing never touches ebrostay.com (prod).
// Production credentials are injected at deploy time by scripts/inject-config.js
// from the SUPABASE_*_PROD secrets (see the Azure Static Web Apps workflow).

const SUPABASE_URL = "https://iwxearkwuxzrlikmblxl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eGVhcmt3dXh6cmxpa21ibHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzk4MzEsImV4cCI6MjA5NzQ1NTgzMX0.orAgzDR6d-wgzpm7IkOGHfEtPu_9MLJbYquTjby5L-w";
