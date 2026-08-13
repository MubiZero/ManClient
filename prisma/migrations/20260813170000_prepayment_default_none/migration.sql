-- Only the default changes: every existing business keeps the mode it is on, including the ones that
-- never touched the setting and are on FULL because that is what the column used to default to.
ALTER TABLE "Business" ALTER COLUMN "prepaymentMode" SET DEFAULT 'NONE';
