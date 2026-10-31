ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS shift text NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night'));
