-- =============================================================================
-- AutoQAD — Angiography/fluoroscopy (XA) QA results table (Leeds TOR-18)
--
-- Mirrors xray_analysis but with Leeds TOR-18 metrics and S3 image storage
-- (output_image_path holds an s3://bucket/key, like ultrasound.output_image_path)
-- rather than DB VARBINARY. One row per XA instance (per-instance granularity).
--
-- Run:  sqlcmd -S <host> -d QA-results -i schema_angio.sql
-- =============================================================================
SET NOCOUNT ON;
GO

IF OBJECT_ID('dbo.angio_analysis','U') IS NULL
CREATE TABLE dbo.angio_analysis (
    id                            INT IDENTITY(1,1) PRIMARY KEY,
    instance                      NVARCHAR(128) NOT NULL,
    series_id                     NVARCHAR(255) NULL,
    -- DICOM metadata
    institution_name              NVARCHAR(256) NULL,
    institutional_department_name NVARCHAR(256) NULL,
    manufacturer                  NVARCHAR(128) NULL,
    manufacturer_model_name       NVARCHAR(128) NULL,
    modality                      NVARCHAR(8)   NULL,
    station_name                  NVARCHAR(256) NULL,
    device_serial_number          NVARCHAR(128) NULL,
    study_date                    NVARCHAR(16)  NULL,
    series_date                   NVARCHAR(16)  NULL,
    content_date                  NVARCHAR(16)  NULL,
    content_time                  NVARCHAR(32)  NULL,
    -- XA acquisition parameters
    kvp                           FLOAT NULL,
    exposure_mas                  FLOAT NULL,
    distance_source_to_detector   FLOAT NULL,
    imager_pixel_spacing          FLOAT NULL,
    -- Leeds TOR-18 results (low-contrast + uniformity reliable; MTF best-effort)
    num_contrast_rois_seen        INT   NULL,
    median_cnr                    FLOAT NULL,
    median_contrast               FLOAT NULL,
    percent_integral_uniformity   FLOAT NULL,
    mtf_50_percent                FLOAT NULL,   -- best-effort; no tolerance
    phantom_area                  FLOAT NULL,
    phantom_center_x              FLOAT NULL,
    phantom_center_y              FLOAT NULL,
    -- Output + bookkeeping
    output_image_path             NVARCHAR(512) NULL,   -- s3://bucket/key (overlay PNG)
    analysis_type                 NVARCHAR(50)  NULL,
    analysis_version              NVARCHAR(50)  NULL,
    processing_time               FLOAT NULL,
    processed_at                  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_angio_analysis_station' AND object_id=OBJECT_ID('dbo.angio_analysis'))
    CREATE INDEX IX_angio_analysis_station ON dbo.angio_analysis(station_name) INCLUDE (processed_at);
GO
PRINT 'angio_analysis table ready.';
GO
