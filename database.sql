-- Drop existing tables down cascadingly (Safe to run multiple times)
DROP TABLE IF EXISTS public.user_last_seen CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.family_requests CASCADE;
DROP TABLE IF EXISTS public.family_members CASCADE;
DROP TABLE IF EXISTS public.organization_supply_transactions CASCADE;
DROP TABLE IF EXISTS public.organization_supplies CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.pin_items CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public."pin-images" CASCADE;
DROP TABLE IF EXISTS public.pins CASCADE;
DROP TABLE IF EXISTS public."org-member" CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  password TEXT NOT NULL,
  image TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  password TEXT,
  region TEXT,
  funding TEXT DEFAULT '$0',
  volunteer_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, inactive, pending
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Organization Members
CREATE TABLE IF NOT EXISTS public."org-member" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'normal', -- normal, tracking
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Pins Table (Map markers / Requests)
CREATE TABLE IF NOT EXISTS public.pins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  type TEXT, -- damage, safe
  title TEXT, 
  description TEXT,
  phone TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'active', -- active, confirmed, resolved, in-progress
  image_url TEXT,
  confirmed_by UUID REFERENCES public."org-member"(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Items Table (Types of supplies)
CREATE TABLE IF NOT EXISTS public.items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT, 
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Pin Items Table (Supplies linked to a specific pin)
CREATE TABLE IF NOT EXISTS public.pin_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pin_id UUID REFERENCES public.pins(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
  requested_qty INTEGER DEFAULT 1,
  remaining_qty INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Organization Supplies (Inventory)
CREATE TABLE IF NOT EXISTS public.organization_supplies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  category TEXT,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  unit TEXT,
  location TEXT,
  expiry_date DATE,
  notes TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_supplies_org_id ON public.organization_supplies(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_supplies_item_id ON public.organization_supplies(item_id);

-- 8. Organization Supply Transactions
CREATE TABLE IF NOT EXISTS public.organization_supply_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  supply_id UUID REFERENCES public.organization_supplies(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  pin_id UUID REFERENCES public.pins(id) ON DELETE SET NULL,
  change_qty INTEGER NOT NULL,
  direction TEXT NOT NULL, -- inbound, outbound, adjustment
  reason TEXT,
  actor_type TEXT DEFAULT 'organization',
  actor_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_supply_tx_org_id ON public.organization_supply_transactions(organization_id);

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT,
  body TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Family Members Table (Safety linking)
CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  relation TEXT,
  safety_status TEXT,
  safety_check_started_at TIMESTAMPTZ,
  safety_check_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Family Requests Table (Invites for family)
CREATE TABLE IF NOT EXISTS public.family_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  relation TEXT,
  status TEXT DEFAULT 'pending', -- pending, accepted, rejected
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Messages Table (Chat logs)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- sent, read
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. User Last Seen Table (Live Tracking)
CREATE TABLE IF NOT EXISTS public.user_last_seen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------
-- Row Level Security (RLS) Policies for Storage Bucket
-- (Run this AFTER manually creating the 'pin-images' bucket in Storage Dashboard)
-- ----------------------------------------------------

-- Allow public viewing of images
CREATE POLICY "Public Read Image"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pin-images');

-- Allow public uploading of images
CREATE POLICY "Public Upload Image"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'pin-images');

-- Notification support for organization accounts
ALTER TABLE IF EXISTS public.notifications
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON public.notifications(organization_id);

-- Refresh the postgREST schema cache
NOTIFY pgrst, 'reload schema';
-- ==============================================================================
-- DEFAULT DATA: Populate items table for Pin Creation
-- ==============================================================================
INSERT INTO public.items (name, unit, description) 
SELECT * FROM (VALUES
  ('Rice', 'bags', 'Standard 5kg bag of rice'),
  ('Water', 'bottles', '1 Liter drinking water'),
  ('Medicine', 'packs', 'Basic first aid and essential medicines'),
  ('Blanket', 'pieces', 'Thermal or warm blankets'),
  ('Canned Food', 'cans', 'Ready to eat canned food'),
  ('Clothes', 'sets', 'Clean clothes for adults and children'),
  ('Flashlight', 'pieces', 'Battery powered flashlight'),
  ('Baby Formula', 'packs', 'Formula milk for infants'),
  ('Tents', 'tents', 'Emergency shelter tents'),
  ('Hygiene Kit', 'kits', 'Soap, toothpaste, sanitary pads, etc.')
) AS new_items (name, unit, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items WHERE items.name = new_items.name
);
