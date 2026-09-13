-- Drop the tables that observed the user.
--
-- Threadline stopped measuring on 9 Sep 2026: progress moves only when the
-- user ticks, and nothing records time, sessions or where a document was left
-- (C11). These five tables held exactly that, so they go rather than sit empty.
--
-- Children before parents. Foreign keys are on, and SQLite empties a table
-- before dropping it. Every reference to `session` today cascades or nulls, so
-- the order is not load-bearing yet - dropping children first keeps it that
-- way if a constraint is ever tightened. Each table's indexes go with it.
--
-- `artifact`, `item_anchor` and `item_anchor_history` are untouched: which
-- files have been seen, and each plan item's history, are still things a file
-- cannot hold.

DROP TABLE item_session;
DROP TABLE session_artifact;
DROP TABLE artifact_access;
DROP TABLE artifact_position;
DROP TABLE session;
