-- DIGI-VOTE reference data. Contains no user accounts or credentials.
INSERT INTO roles (code, name, description) VALUES
    ('ORG_OWNER', 'Organization Owner', 'Manages the organization workspace, members, roles and election oversight'),
    ('ELECTION_ADMIN', 'Election Administrator', 'Runs the election lifecycle: rules, candidates, voters, results'),
    ('CANDIDATE', 'Candidate', 'Contests elections with a profile and manifesto; may vote if eligible'),
    ('VOTER', 'Voter', 'Casts one anonymous vote per eligible election and verifies receipts'),
    ('AUDITOR', 'Auditor', 'Read-only inspection of audit chains, bulletin boards and reports');
