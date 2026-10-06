-- =============================================================================
-- AutoQAD — Event-driven QA task coordination (manuscript §2.2.3)
--
-- Lisää nykyiseen QA-results-tietokantaan:
--   * Service Broker (push-notifikaatio = "doorbell") per modaliteetti
--   * Modality-spesifiset JOB-taulut eksplisiittisellä tilakoneella
--       QUEUED -> CLAIMED -> RUNNING -> COMPLETED | FAILED
--   * Insert-triggerit jotka herättävät workerit uudesta jobista
--
-- Suunnittelumalli: Service Broker toimii VAIN herätyksenä (doorbell). Jobin
-- varaus (claim) tehdään atomisesti job-taulusta (UPDATE ... READPAST), joten
-- kadonnut/kahdentunut viesti EI johda kadonneeseen/kahteen kertaan ajettuun
-- jobiin. Workerit myös WAITFOR-timeouttaavat säännöllisesti -> vaikka herätys
-- jäisi saamatta, QUEUED-jobit tulevat silti käsitellyiksi. Idempotenssi:
-- UNIQUE(orthanc_id) estää duplikaattijobit (ingestionin dedup).
--
-- Ajo:  sqlcmd -S <host> -d QA-results -i schema_eventdriven.sql
-- Tulokset tallennetaan edelleen olemassa oleviin result-tauluihin
-- (ultrasound / xray_analysis / ct_analysis) — tämä tiedosto lisää vain
-- koordinoinnin, ei kosketa result-skeemaan.
-- =============================================================================
SET NOCOUNT ON;
GO

-- --- 1) Service Broker päälle (idempotentti) -------------------------------
IF (SELECT is_broker_enabled FROM sys.databases WHERE name = DB_NAME()) = 0
BEGIN
    DECLARE @sql NVARCHAR(MAX) =
        N'ALTER DATABASE [' + DB_NAME() + N'] SET ENABLE_BROKER WITH ROLLBACK IMMEDIATE;';
    EXEC (@sql);
    PRINT 'Service Broker enabled.';
END
ELSE PRINT 'Service Broker already enabled.';
GO

-- --- 2) Service Broker -objektit per modaliteetti --------------------------
-- Yksi message type + contract jaettuna; queue + service per modaliteetti,
-- jotta kunkin modaliteetin workerit kuuntelevat vain omaa jonoaan.
IF NOT EXISTS (SELECT 1 FROM sys.service_message_types WHERE name = N'//autoqad/QAJob')
    CREATE MESSAGE TYPE [//autoqad/QAJob] VALIDATION = NONE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.service_contracts WHERE name = N'//autoqad/QAJobContract')
    CREATE CONTRACT [//autoqad/QAJobContract] ([//autoqad/QAJob] SENT BY INITIATOR);
GO

-- US
IF NOT EXISTS (SELECT 1 FROM sys.service_queues WHERE name = N'USJobQueue')
    CREATE QUEUE USJobQueue;
GO
IF NOT EXISTS (SELECT 1 FROM sys.services WHERE name = N'//autoqad/USJobService')
    CREATE SERVICE [//autoqad/USJobService] ON QUEUE USJobQueue ([//autoqad/QAJobContract]);
GO
-- XR
IF NOT EXISTS (SELECT 1 FROM sys.service_queues WHERE name = N'XRJobQueue')
    CREATE QUEUE XRJobQueue;
GO
IF NOT EXISTS (SELECT 1 FROM sys.services WHERE name = N'//autoqad/XRJobService')
    CREATE SERVICE [//autoqad/XRJobService] ON QUEUE XRJobQueue ([//autoqad/QAJobContract]);
GO
-- CT
IF NOT EXISTS (SELECT 1 FROM sys.service_queues WHERE name = N'CTJobQueue')
    CREATE QUEUE CTJobQueue;
GO
IF NOT EXISTS (SELECT 1 FROM sys.services WHERE name = N'//autoqad/CTJobService')
    CREATE SERVICE [//autoqad/CTJobService] ON QUEUE CTJobQueue ([//autoqad/QAJobContract]);
GO

-- --- 3) Job-taulut (tilakone) ----------------------------------------------
-- orthanc_id: US = Orthanc-INSTANSSI-id, XR/CT = Orthanc-SARJA-id (analyysin
-- rakeisuus per modaliteetti). resource_level dokumentoi tämän.
IF OBJECT_ID('dbo.us_jobs','U') IS NULL
CREATE TABLE dbo.us_jobs (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    orthanc_id          NVARCHAR(128) NOT NULL,
    resource_level      NVARCHAR(10)  NOT NULL DEFAULT 'instance',
    modality            NVARCHAR(8)   NOT NULL DEFAULT 'US',
    study_instance_uid  NVARCHAR(255) NULL,
    series_instance_uid NVARCHAR(255) NULL,
    sop_instance_uid    NVARCHAR(255) NULL,
    station_name        NVARCHAR(256) NULL,
    status              NVARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    claimed_by          NVARCHAR(128) NULL,
    claimed_at          DATETIME2     NULL,
    started_at          DATETIME2     NULL,
    completed_at        DATETIME2     NULL,
    attempts            INT           NOT NULL DEFAULT 0,
    error_message       NVARCHAR(MAX) NULL,
    created_at          DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2     NULL,
    CONSTRAINT UQ_us_jobs_orthanc UNIQUE (orthanc_id),
    CONSTRAINT CK_us_jobs_status CHECK (status IN ('QUEUED','CLAIMED','RUNNING','COMPLETED','FAILED'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_us_jobs_status' AND object_id=OBJECT_ID('dbo.us_jobs'))
    CREATE INDEX IX_us_jobs_status ON dbo.us_jobs(status) INCLUDE (claimed_at);
GO

IF OBJECT_ID('dbo.xray_jobs','U') IS NULL
CREATE TABLE dbo.xray_jobs (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    orthanc_id          NVARCHAR(128) NOT NULL,
    resource_level      NVARCHAR(10)  NOT NULL DEFAULT 'series',
    modality            NVARCHAR(8)   NOT NULL DEFAULT 'CR',
    study_instance_uid  NVARCHAR(255) NULL,
    series_instance_uid NVARCHAR(255) NULL,
    sop_instance_uid    NVARCHAR(255) NULL,
    station_name        NVARCHAR(256) NULL,
    status              NVARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    claimed_by          NVARCHAR(128) NULL,
    claimed_at          DATETIME2     NULL,
    started_at          DATETIME2     NULL,
    completed_at        DATETIME2     NULL,
    attempts            INT           NOT NULL DEFAULT 0,
    error_message       NVARCHAR(MAX) NULL,
    created_at          DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2     NULL,
    CONSTRAINT UQ_xray_jobs_orthanc UNIQUE (orthanc_id),
    CONSTRAINT CK_xray_jobs_status CHECK (status IN ('QUEUED','CLAIMED','RUNNING','COMPLETED','FAILED'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_xray_jobs_status' AND object_id=OBJECT_ID('dbo.xray_jobs'))
    CREATE INDEX IX_xray_jobs_status ON dbo.xray_jobs(status) INCLUDE (claimed_at);
GO

IF OBJECT_ID('dbo.ct_jobs','U') IS NULL
CREATE TABLE dbo.ct_jobs (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    orthanc_id          NVARCHAR(128) NOT NULL,
    resource_level      NVARCHAR(10)  NOT NULL DEFAULT 'series',
    modality            NVARCHAR(8)   NOT NULL DEFAULT 'CT',
    study_instance_uid  NVARCHAR(255) NULL,
    series_instance_uid NVARCHAR(255) NULL,
    sop_instance_uid    NVARCHAR(255) NULL,
    station_name        NVARCHAR(256) NULL,
    status              NVARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    claimed_by          NVARCHAR(128) NULL,
    claimed_at          DATETIME2     NULL,
    started_at          DATETIME2     NULL,
    completed_at        DATETIME2     NULL,
    attempts            INT           NOT NULL DEFAULT 0,
    error_message       NVARCHAR(MAX) NULL,
    created_at          DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2     NULL,
    CONSTRAINT UQ_ct_jobs_orthanc UNIQUE (orthanc_id),
    CONSTRAINT CK_ct_jobs_status CHECK (status IN ('QUEUED','CLAIMED','RUNNING','COMPLETED','FAILED'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ct_jobs_status' AND object_id=OBJECT_ID('dbo.ct_jobs'))
    CREATE INDEX IX_ct_jobs_status ON dbo.ct_jobs(status) INCLUDE (claimed_at);
GO

-- --- 4) Herätystriggerit (doorbell) ----------------------------------------
-- Vain QUEUED-rivit herättävät. Fire-and-forget: avaa dialogi, lähettää jobin
-- id|orthanc_id -vihjeen ja PÄÄTTÄÄ keskustelun heti (initiator-puoli). Worker
-- (target) päättää omansa RECEIVE-silmukassa. Viestin sisältö on vain vihje —
-- worker varaa jobin taulusta, ei viestistä.
IF OBJECT_ID('dbo.trg_us_jobs_notify','TR') IS NOT NULL DROP TRIGGER dbo.trg_us_jobs_notify;
GO
CREATE TRIGGER dbo.trg_us_jobs_notify ON dbo.us_jobs AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @h UNIQUEIDENTIFIER, @msg NVARCHAR(256);
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT CAST(id AS NVARCHAR(20)) + '|' + orthanc_id FROM inserted WHERE status = 'QUEUED';
    OPEN c; FETCH NEXT FROM c INTO @msg;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN DIALOG CONVERSATION @h
            FROM SERVICE [//autoqad/USJobService] TO SERVICE N'//autoqad/USJobService'
            ON CONTRACT [//autoqad/QAJobContract] WITH ENCRYPTION = OFF;
        SEND ON CONVERSATION @h MESSAGE TYPE [//autoqad/QAJob] (@msg);
        END CONVERSATION @h;
        FETCH NEXT FROM c INTO @msg;
    END
    CLOSE c; DEALLOCATE c;
END;
GO

IF OBJECT_ID('dbo.trg_xray_jobs_notify','TR') IS NOT NULL DROP TRIGGER dbo.trg_xray_jobs_notify;
GO
CREATE TRIGGER dbo.trg_xray_jobs_notify ON dbo.xray_jobs AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @h UNIQUEIDENTIFIER, @msg NVARCHAR(256);
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT CAST(id AS NVARCHAR(20)) + '|' + orthanc_id FROM inserted WHERE status = 'QUEUED';
    OPEN c; FETCH NEXT FROM c INTO @msg;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN DIALOG CONVERSATION @h
            FROM SERVICE [//autoqad/XRJobService] TO SERVICE N'//autoqad/XRJobService'
            ON CONTRACT [//autoqad/QAJobContract] WITH ENCRYPTION = OFF;
        SEND ON CONVERSATION @h MESSAGE TYPE [//autoqad/QAJob] (@msg);
        END CONVERSATION @h;
        FETCH NEXT FROM c INTO @msg;
    END
    CLOSE c; DEALLOCATE c;
END;
GO

IF OBJECT_ID('dbo.trg_ct_jobs_notify','TR') IS NOT NULL DROP TRIGGER dbo.trg_ct_jobs_notify;
GO
CREATE TRIGGER dbo.trg_ct_jobs_notify ON dbo.ct_jobs AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @h UNIQUEIDENTIFIER, @msg NVARCHAR(256);
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT CAST(id AS NVARCHAR(20)) + '|' + orthanc_id FROM inserted WHERE status = 'QUEUED';
    OPEN c; FETCH NEXT FROM c INTO @msg;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN DIALOG CONVERSATION @h
            FROM SERVICE [//autoqad/CTJobService] TO SERVICE N'//autoqad/CTJobService'
            ON CONTRACT [//autoqad/QAJobContract] WITH ENCRYPTION = OFF;
        SEND ON CONVERSATION @h MESSAGE TYPE [//autoqad/QAJob] (@msg);
        END CONVERSATION @h;
        FETCH NEXT FROM c INTO @msg;
    END
    CLOSE c; DEALLOCATE c;
END;
GO

PRINT 'Event-driven schema ready: us_jobs / xray_jobs / ct_jobs + Service Broker queues.';
GO
