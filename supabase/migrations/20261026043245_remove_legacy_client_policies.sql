-- Remove exactly the two unrestricted authenticated-write policies reported
-- by the security advisor. Public read policies and service policies remain.
DROP POLICY IF EXISTS "Admins full access on campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins full access on courses" ON public.courses;

NOTIFY pgrst, 'reload schema';
