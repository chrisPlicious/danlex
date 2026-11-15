-- Entry fees for the Danlex Open: ₱130 singles, ₱260 doubles.
--
-- Reconstructed from the live database on 2026-11-15 (the original file was never committed).
-- Live divisions were last updated by this migration and now hold exactly these fees.
-- Already applied in production, so db-apply skips it there. Fresh databases get the
-- same fees from seed.sql, which runs after migrations.

update public.divisions set fee = 130 where kind = 'singles';
update public.divisions set fee = 260 where kind = 'doubles';
