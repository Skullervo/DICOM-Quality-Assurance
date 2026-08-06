-- AutoQAD MSSQL-skeema (generoitu PostgreSQL-skeemasta)
-- Korvaa Django-migraatiot. Aja: sqlcmd -d QA-results -i schema_mssql.sql
-- Django/auth-taulut jätetty pois (poistetaan).

IF OBJECT_ID('[ct_analysis]','U') IS NULL
CREATE TABLE [ct_analysis] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [instance] NVARCHAR(MAX) NULL,
    [series_id] NVARCHAR(MAX) NULL,
    [processed_at] DATETIME2 NULL,
    [content_date] NVARCHAR(MAX) NULL,
    [content_time] NVARCHAR(MAX) NULL,
    [device_serial_number] NVARCHAR(MAX) NULL,
    [instance_number] NVARCHAR(MAX) NULL,
    [institution_name] NVARCHAR(MAX) NULL,
    [institutional_department_name] NVARCHAR(MAX) NULL,
    [manufacturer] NVARCHAR(MAX) NULL,
    [manufacturer_model_name] NVARCHAR(MAX) NULL,
    [modality] NVARCHAR(MAX) NULL,
    [patient_id] NVARCHAR(MAX) NULL,
    [patient_name] NVARCHAR(MAX) NULL,
    [station_name] NVARCHAR(MAX) NULL,
    [series_date] NVARCHAR(MAX) NULL,
    [study_date] NVARCHAR(MAX) NULL,
    [kvp] NVARCHAR(MAX) NULL,
    [tube_current] NVARCHAR(MAX) NULL,
    [exposure_time] NVARCHAR(MAX) NULL,
    [exposure_mAs] NVARCHAR(MAX) NULL,
    [slice_thickness] FLOAT NULL,
    [slice_spacing] FLOAT NULL,
    [reconstruction_kernel] NVARCHAR(MAX) NULL,
    [reconstruction_algorithm] NVARCHAR(MAX) NULL,
    [ctdi_vol] FLOAT NULL,
    [dlp] FLOAT NULL,
    [phantom_model] NVARCHAR(MAX) NULL,
    [phantom_roll_deg] FLOAT NULL,
    [origin_slice] INT NULL,
    [num_images] INT NULL,
    [hu_air] FLOAT NULL,
    [hu_pmp] FLOAT NULL,
    [hu_ldpe] FLOAT NULL,
    [hu_poly] FLOAT NULL,
    [hu_acrylic] FLOAT NULL,
    [hu_delrin] FLOAT NULL,
    [hu_teflon] FLOAT NULL,
    [slice_thickness_mm] FLOAT NULL,
    [ctp404_pass] BIT NULL,
    [uniformity_index] FLOAT NULL,
    [integral_non_uniformity] FLOAT NULL,
    [hu_center] FLOAT NULL,
    [hu_top] FLOAT NULL,
    [hu_right] FLOAT NULL,
    [hu_bottom] FLOAT NULL,
    [hu_left] FLOAT NULL,
    [ctp486_pass] BIT NULL,
    [mtf_50_percent] FLOAT NULL,
    [mtf_10_percent] FLOAT NULL,
    [mtf_data] NVARCHAR(MAX) NULL,
    [ctp528_pass] BIT NULL,
    [num_low_contrast_rois_seen] INT NULL,
    [median_cnr] FLOAT NULL,
    [low_contrast_details] NVARCHAR(MAX) NULL,
    [ctp515_pass] BIT NULL,
    [overall_pass] BIT NULL,
    [noise_hu_std] FLOAT NULL,
    [analysis_type] NVARCHAR(MAX) NULL,
    [analysis_version] NVARCHAR(MAX) NULL,
    [processing_time] FLOAT NULL,
    [summary_image] VARBINARY(MAX) NULL,
    [hu_linearity_image] VARBINARY(MAX) NULL,
    [thickness_image] VARBINARY(MAX) NULL,
    [uniformity_image] VARBINARY(MAX) NULL,
    [mtf_image] VARBINARY(MAX) NULL,
    [low_contrast_image] VARBINARY(MAX) NULL,
    [hu_linearity_chart_image] VARBINARY(MAX) NULL,
    [mtf_chart_image] VARBINARY(MAX) NULL,
    [uniformity_profile_image] VARBINARY(MAX) NULL,
    [side_view_image] VARBINARY(MAX) NULL,
    CONSTRAINT [PK_ct_analysis] PRIMARY KEY ([id])
);

IF OBJECT_ID('[platform_connections]','U') IS NULL
CREATE TABLE [platform_connections] (
    [id] BIGINT NOT NULL,
    [protocol] NVARCHAR(20) NOT NULL,
    [label] NVARCHAR(100) NOT NULL,
    [from_service_id] BIGINT NOT NULL,
    [to_service_id] BIGINT NOT NULL,
    [project_id] BIGINT NULL
);

IF OBJECT_ID('[platform_deployed_services]','U') IS NULL
CREATE TABLE [platform_deployed_services] (
    [id] BIGINT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [container_name] NVARCHAR(100) NOT NULL,
    [image] NVARCHAR(200) NOT NULL,
    [deploy_config] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [is_managed] BIT NOT NULL,
    [notes] NVARCHAR(MAX) NOT NULL,
    [deployed_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [template_id] BIGINT NULL
);

IF OBJECT_ID('[platform_layers]','U') IS NULL
CREATE TABLE [platform_layers] (
    [id] BIGINT NOT NULL,
    [name] NVARCHAR(50) NOT NULL,
    [label] NVARCHAR(100) NOT NULL,
    [order] INT NOT NULL,
    [y_position] FLOAT NOT NULL,
    [height] FLOAT NOT NULL,
    [color] NVARCHAR(30) NOT NULL,
    [project_id] BIGINT NOT NULL
);

IF OBJECT_ID('[platform_projects]','U') IS NULL
CREATE TABLE [platform_projects] (
    [id] BIGINT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(500) NOT NULL,
    [is_default] BIT NOT NULL,
    [svg_width] INT NOT NULL,
    [svg_height] INT NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL
);

IF OBJECT_ID('[platform_service_stacks]','U') IS NULL
CREATE TABLE [platform_service_stacks] (
    [id] BIGINT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [network_name] NVARCHAR(100) NOT NULL,
    [is_builtin] BIT NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL
);

IF OBJECT_ID('[platform_service_templates]','U') IS NULL
CREATE TABLE [platform_service_templates] (
    [id] BIGINT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [template_type] NVARCHAR(20) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [icon] NVARCHAR(50) NOT NULL,
    [image] NVARCHAR(200) NOT NULL,
    [config] NVARCHAR(MAX) NOT NULL,
    [is_active] BIT NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL
);

IF OBJECT_ID('[platform_services]','U') IS NULL
CREATE TABLE [platform_services] (
    [id] BIGINT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(255) NOT NULL,
    [container] NVARCHAR(100) NOT NULL,
    [host] NVARCHAR(100) NOT NULL,
    [port] INT NOT NULL,
    [host_port] INT NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [layer] NVARCHAR(20) NOT NULL,
    [url] NVARCHAR(200) NOT NULL,
    [pos_x] FLOAT NOT NULL,
    [pos_y] FLOAT NOT NULL,
    [is_active] BIT NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] BIGINT NULL,
    [layer_ref_id] BIGINT NULL
);

IF OBJECT_ID('[platform_stack_connections]','U') IS NULL
CREATE TABLE [platform_stack_connections] (
    [id] BIGINT NOT NULL,
    [protocol] NVARCHAR(20) NOT NULL,
    [port] INT NOT NULL,
    [label] NVARCHAR(100) NOT NULL,
    [from_service_id] BIGINT NOT NULL,
    [stack_id] BIGINT NOT NULL,
    [to_service_id] BIGINT NOT NULL
);

IF OBJECT_ID('[platform_stack_services]','U') IS NULL
CREATE TABLE [platform_stack_services] (
    [id] BIGINT NOT NULL,
    [service_name] NVARCHAR(100) NOT NULL,
    [container_name] NVARCHAR(100) NOT NULL,
    [image] NVARCHAR(200) NOT NULL,
    [build_context] NVARCHAR(255) NOT NULL,
    [dockerfile] NVARCHAR(100) NOT NULL,
    [environment] NVARCHAR(MAX) NOT NULL,
    [ports] NVARCHAR(MAX) NOT NULL,
    [volumes] NVARCHAR(MAX) NOT NULL,
    [healthcheck] NVARCHAR(MAX) NOT NULL,
    [restart_policy] NVARCHAR(30) NOT NULL,
    [network_aliases] NVARCHAR(MAX) NOT NULL,
    [depends_on] NVARCHAR(MAX) NOT NULL,
    [deploy_order] INT NOT NULL,
    [stack_id] BIGINT NOT NULL,
    [template_id] BIGINT NULL,
    [layer] NVARCHAR(20) NOT NULL,
    [order_in_layer] INT NOT NULL
);

IF OBJECT_ID('[ultrasound]','U') IS NULL
CREATE TABLE [ultrasound] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [institutionname] NVARCHAR(MAX) NULL,
    [institutionaldepartmentname] NVARCHAR(MAX) NULL,
    [manufacturer] NVARCHAR(MAX) NULL,
    [modality] NVARCHAR(MAX) NULL,
    [stationname] NVARCHAR(MAX) NULL,
    [seriesdate] NVARCHAR(MAX) NULL,
    [instance] NVARCHAR(MAX) NULL,
    [serie] NVARCHAR(MAX) NULL,
    [s_depth] FLOAT NULL,
    [u_cov] FLOAT NULL,
    [u_skew] FLOAT NULL,
    [u_low] NVARCHAR(MAX) NULL,
    [series_id] NVARCHAR(MAX) NULL,
    [processed_at] DATETIMEOFFSET NULL,
    [contentdate] NVARCHAR(MAX) NULL,
    [contenttime] NVARCHAR(MAX) NULL,
    [deviceserialnumber] NVARCHAR(MAX) NULL,
    [instancenumber] NVARCHAR(MAX) NULL,
    [manufacturermodelname] NVARCHAR(MAX) NULL,
    [patientid] NVARCHAR(MAX) NULL,
    [patientname] NVARCHAR(MAX) NULL,
    [studydate] NVARCHAR(MAX) NULL,
    [tranducertype] NVARCHAR(MAX) NULL,
    [horiz_prof] NVARCHAR(MAX) NULL,
    [vert_prof] NVARCHAR(MAX) NULL,
    [straightened_instance] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_ultrasound] PRIMARY KEY ([id])
);

IF OBJECT_ID('[xray_analysis]','U') IS NULL
CREATE TABLE [xray_analysis] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [instance] NVARCHAR(MAX) NULL,
    [series_id] NVARCHAR(MAX) NULL,
    [processed_at] DATETIME2 NULL,
    [content_date] NVARCHAR(MAX) NULL,
    [content_time] NVARCHAR(MAX) NULL,
    [device_serial_number] NVARCHAR(MAX) NULL,
    [instance_number] NVARCHAR(MAX) NULL,
    [institution_name] NVARCHAR(MAX) NULL,
    [institutional_department_name] NVARCHAR(MAX) NULL,
    [manufacturer] NVARCHAR(MAX) NULL,
    [manufacturer_model_name] NVARCHAR(MAX) NULL,
    [modality] NVARCHAR(MAX) NULL,
    [patient_id] NVARCHAR(MAX) NULL,
    [patient_name] NVARCHAR(MAX) NULL,
    [station_name] NVARCHAR(MAX) NULL,
    [series_date] NVARCHAR(MAX) NULL,
    [study_date] NVARCHAR(MAX) NULL,
    [kvp] NVARCHAR(MAX) NULL,
    [exposure_time] NVARCHAR(MAX) NULL,
    [tube_current] NVARCHAR(MAX) NULL,
    [filter_type] NVARCHAR(MAX) NULL,
    [grid_info] NVARCHAR(MAX) NULL,
    [distance_source_to_detector] NVARCHAR(MAX) NULL,
    [focal_spot] NVARCHAR(MAX) NULL,
    [protocol_name] NVARCHAR(MAX) NULL,
    [exposure_mas] NVARCHAR(MAX) NULL,
    [uniformity_center] FLOAT NULL,
    [uniformity_deviation] FLOAT NULL,
    [bg_mean] FLOAT NULL,
    [cu_000_mean] FLOAT NULL,
    [cu_030_mean] FLOAT NULL,
    [cu_065_mean] FLOAT NULL,
    [cu_100_mean] FLOAT NULL,
    [cu_140_mean] FLOAT NULL,
    [cu_185_mean] FLOAT NULL,
    [cu_230_mean] FLOAT NULL,
    [cu_000_std] FLOAT NULL,
    [cu_030_std] FLOAT NULL,
    [cu_065_std] FLOAT NULL,
    [cu_100_std] FLOAT NULL,
    [cu_140_std] FLOAT NULL,
    [cu_185_std] FLOAT NULL,
    [cu_230_std] FLOAT NULL,
    [lc_08_contrast] FLOAT NULL,
    [lc_12_contrast] FLOAT NULL,
    [lc_20_contrast] FLOAT NULL,
    [lc_28_contrast] FLOAT NULL,
    [lc_40_contrast] FLOAT NULL,
    [lc_56_contrast] FLOAT NULL,
    [low_contrast_details] NVARCHAR(MAX) NULL,
    [median_contrast] FLOAT NULL,
    [median_cnr] FLOAT NULL,
    [mtf_50_percent] FLOAT NULL,
    [num_contrast_rois_seen] INT NULL,
    [phantom_angle] FLOAT NULL,
    [phantom_center_x] FLOAT NULL,
    [phantom_center_y] FLOAT NULL,
    [phantom_area] FLOAT NULL,
    [side_length] FLOAT NULL,
    [mtf_data] NVARCHAR(MAX) NULL,
    [analysis_type] NVARCHAR(MAX) NULL,
    [analysis_version] NVARCHAR(MAX) NULL,
    [processing_time] FLOAT NULL,
    [contrast_rois_image] VARBINARY(MAX) NULL,
    [mtf_curve_image] VARBINARY(MAX) NULL,
    [mtf_lp_image] VARBINARY(MAX) NULL,
    CONSTRAINT [PK_xray_analysis] PRIMARY KEY ([id])
);

-- processed_at-defaultit (idempotentti)
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name='DF_us_pa')
    ALTER TABLE [ultrasound] ADD CONSTRAINT [DF_us_pa] DEFAULT SYSDATETIMEOFFSET() FOR [processed_at];
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name='DF_xr_pa')
    ALTER TABLE [xray_analysis] ADD CONSTRAINT [DF_xr_pa] DEFAULT SYSDATETIME() FOR [processed_at];
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name='DF_ct_pa')
    ALTER TABLE [ct_analysis] ADD CONSTRAINT [DF_ct_pa] DEFAULT SYSDATETIME() FOR [processed_at];

-- Rekisteritaulut (laite-/instituutiorekisteri, tuleva ominaisuus)
IF OBJECT_ID('institutions','U') IS NULL
CREATE TABLE [institutions] (
    [id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_institutions] PRIMARY KEY,
    [name] NVARCHAR(255) NULL,
    [region] NVARCHAR(255) NULL,
    [address] NVARCHAR(MAX) NULL,
    [contact_info] NVARCHAR(MAX) NULL,
    [is_active] BIT NULL CONSTRAINT [DF_inst_active] DEFAULT 1
);
IF OBJECT_ID('devices','U') IS NULL
CREATE TABLE [devices] (
    [id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_devices] PRIMARY KEY,
    [station_name] NVARCHAR(255) NULL,
    [serial_number] NVARCHAR(255) NULL,
    [manufacturer] NVARCHAR(255) NULL,
    [model_name] NVARCHAR(255) NULL,
    [department] NVARCHAR(255) NULL,
    [modality_type] NVARCHAR(50) NULL,
    [is_active] BIT NULL CONSTRAINT [DF_dev_active] DEFAULT 1,
    [institution_id] INT NULL
);
