// Supabase connection settings.
// Fill these two values from your Supabase project:
// Project Settings -> API -> Project URL and "anon public" key.
// The anon key is safe to publish: all permissions are enforced by
// Row Level Security policies in the database (see supabase/schema.sql).
//
// While these are empty the website keeps working with the built-in
// sample data from data.js.
//
// STRIPE_PUBLISHABLE_KEY is the public (pk_) key; the secret key lives
// only in Supabase Edge Function secrets, never in this repo.

const SUPABASE_URL = "https://zbgywbigbdvqaxdloamh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZ3l3YmlnYmR2cWF4ZGxvYW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzY0MjQsImV4cCI6MjA5Njg1MjQyNH0.wt0gUrs2KNRE8sd0Yn55wsm_Zvd1RE84Lk3yPzEpwwg";

const STRIPE_PUBLISHABLE_KEY = "pk_test_51Thc3uC3W20ye8Ul1aDBdpHHumWtqY8YujhCkk2QtLCI5UCpn48dPTRcEVYXbIwDP4PJQqlL1hg1vnscxnAwFIB500Bqfhlzlr";
