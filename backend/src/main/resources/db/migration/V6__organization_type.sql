-- DIGI-VOTE V6: organization type chosen at registration (University, Company, ...). Existing organizations keep NULL.
ALTER TABLE organizations
    ADD COLUMN org_type VARCHAR(24) NULL AFTER description,
    ADD CONSTRAINT ck_organizations_type CHECK (org_type IS NULL OR org_type IN
        ('UNIVERSITY', 'COMPANY', 'HOUSING_SOCIETY', 'NGO', 'CLUB', 'OTHER'));
