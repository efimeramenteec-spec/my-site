-- Lead funnel — Phase B: bot support columns. Additive only.
-- Applied via the Supabase connector as migration `lead_funnel_02_bot`.

-- Public HTTPS URL of each therapist's card image, used as the interactive
-- message header for the "Elegir a {nombre}" cards. NULL → the bot falls back to
-- a text header (name) so the flow still works before the images are hosted.
alter table therapists add column if not exists funnel_card_url text;

-- Consecutive unclassifiable free-text messages mid-flow. Reset to 0 on any
-- recognized tap or successfully classified message; a 2nd miss escalates to
-- Nicolás + pause (spec: "a second unclassifiable message → push"). 'otro'
-- escalates immediately without needing the counter.
alter table leads add column if not exists parse_misses integer not null default 0;
