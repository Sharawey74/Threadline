-- Separate a file's identity from its address.
--
-- `path` holds the normalised lookup key: slash-separated and lowercased, so
-- that one document cannot become two rows and split its recorded history
-- between them. That key is the right thing to compare and the wrong thing to
-- open a file by — lowercasing an address only works on a case-insensitive
-- filesystem, and it fails silently on every other one.
--
-- `real_path` is the address: the relative path exactly as it sits on disk.

ALTER TABLE artifact ADD COLUMN real_path TEXT;

-- Existing rows only ever stored the key, so that is the best address we have
-- for them. It is what they were already being opened by, so nothing is worse
-- than before, and the next scan re-registers each file and restores its true
-- casing.
UPDATE artifact SET real_path = path WHERE real_path IS NULL;
