-- DIGI-VOTE V5: DV numbers, a human-friendly sign-in identifier (DV-2026-00001) that is unique per account.
-- Issued per calendar year from a counter row, so numbers are never reused. Email sign-in keeps working.

CREATE TABLE dv_number_counters (
    year_no    INT NOT NULL,
    last_number INT NOT NULL,
    PRIMARY KEY (year_no),
    CONSTRAINT ck_dv_counter CHECK (last_number >= 0)
) ENGINE = InnoDB;

ALTER TABLE users ADD COLUMN dv_number VARCHAR(20) NULL AFTER id;

-- Existing accounts: number them per creation year, oldest first.
UPDATE users u
    JOIN (SELECT id, YEAR(created_at) AS y, ROW_NUMBER() OVER (PARTITION BY YEAR(created_at) ORDER BY id) AS n
          FROM users) r ON r.id = u.id
SET u.dv_number = CONCAT('DV-', r.y, '-', LPAD(r.n, 5, '0'));

INSERT INTO dv_number_counters (year_no, last_number)
SELECT YEAR(created_at), COUNT(*) FROM users GROUP BY YEAR(created_at);

ALTER TABLE users
    MODIFY dv_number VARCHAR(20) NOT NULL,
    ADD CONSTRAINT uq_users_dv_number UNIQUE (dv_number),
    ADD CONSTRAINT ck_users_dv_number CHECK (dv_number REGEXP '^DV-[0-9]{4}-[0-9]{5,}$');
