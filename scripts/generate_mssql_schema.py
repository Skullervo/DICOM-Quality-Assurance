r"""Generoi MSSQL (T-SQL) -skeema introspektoimalla nykyinen PostgreSQL-skeema.

Kohteet: sovellustaulut (ultrasound, xray_analysis, ct_analysis, platform_*).
Jätetään pois Django/auth-taulut (django_*, auth_*) — Django poistetaan.

Tuottaa: scripts/schema_mssql.sql

Käyttö:
    python scripts/generate_mssql_schema.py
"""
from pathlib import Path
import psycopg2

ROOT = Path(__file__).resolve().parent.parent
# Lopputulos kirjoitetaan tähän tiedostoon (valmis T-SQL-skeema).
OUT = ROOT / "scripts" / "schema_mssql.sql"

# Lue .env ja muodosta PostgreSQL-yhteysasetukset (lähdekanta, josta skeema luetaan).
env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip()
PG = dict(host="localhost", port=15432, dbname="QA-results",
          user="postgres", password=env.get("DATABASE_PASSWORD", ""))

# Nämä etuliitteet ohitetaan: Djangon omat taulut poistuvat migraation myötä.
EXCLUDE_PREFIX = ("django_", "auth_")


def map_type(col):
    """PG-tyyppi -> T-SQL-tyyppi."""
    dt = col["data_type"]
    n = col["char_max_len"]
    udt = col["udt_name"]
    if dt == "ARRAY":
        return "NVARCHAR(MAX)"                       # esim. double precision[] -> JSON-string
    return {
        "integer": "INT",
        "bigint": "BIGINT",
        "smallint": "SMALLINT",
        "boolean": "BIT",
        "text": "NVARCHAR(MAX)",
        "character varying": f"NVARCHAR({n})" if n else "NVARCHAR(255)",
        "character": f"NCHAR({n})" if n else "NCHAR(1)",
        "double precision": "FLOAT",
        "real": "REAL",
        "numeric": "DECIMAL(18,6)",
        "date": "DATE",
        "timestamp without time zone": "DATETIME2",
        "timestamp with time zone": "DATETIMEOFFSET",
        "time without time zone": "TIME",
        "jsonb": "NVARCHAR(MAX)",                    # OPENJSON/JSON_VALUE luettaessa
        "json": "NVARCHAR(MAX)",
        "bytea": "VARBINARY(MAX)",                   # analyysikuvat
        "uuid": "UNIQUEIDENTIFIER",
    }.get(dt, "NVARCHAR(MAX)")


def main():
    conn = psycopg2.connect(**PG)
    cur = conn.cursor()
    # Hae kaikkien taulujen nimet PostgreSQLin metatietokannasta (information_schema)
    # ja suodata Django/auth-taulut pois.
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name
    """)
    tables = [t for (t,) in cur.fetchall() if not t.startswith(EXCLUDE_PREFIX)]

    lines = [
        "-- AutoQAD MSSQL-skeema (generoitu PostgreSQL-skeemasta)",
        "-- Korvaa Django-migraatiot. Aja: sqlcmd -d QA-results -i schema_mssql.sql",
        "-- Django/auth-taulut jätetty pois (poistetaan).",
        "",
    ]
    # Käydään jokainen taulu läpi ja luetaan sen sarakkeiden tyypit metatiedoista.
    for t in tables:
        cur.execute("""
            SELECT column_name, data_type, character_maximum_length, udt_name,
                   is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s
            ORDER BY ordinal_position
        """, (t,))
        cols = [dict(name=r[0], data_type=r[1], char_max_len=r[2], udt_name=r[3],
                     nullable=r[4] == "YES", default=r[5]) for r in cur.fetchall()]

        lines.append(f"IF OBJECT_ID('[{t}]','U') IS NULL")
        lines.append(f"CREATE TABLE [{t}] (")
        coldefs = []
        pk = None
        for c in cols:
            tsql = map_type(c)
            # PG:n serial-sarake (default nextval) -> MSSQL:n IDENTITY (automaattinen juokseva id).
            is_serial = c["default"] and "nextval" in str(c["default"])
            if is_serial:
                tsql += " IDENTITY(1,1)"
                if c["name"] == "id":
                    pk = c["name"]
            null = "NULL" if c["nullable"] else "NOT NULL"
            coldefs.append(f"    [{c['name']}] {tsql} {null}")
        if pk:
            coldefs.append(f"    CONSTRAINT [PK_{t}] PRIMARY KEY ([{pk}])")
        lines.append(",\n".join(coldefs))
        lines.append(");")
        lines.append("")
        print(f"  {t}: {len(cols)} saraketta" + (f", PK={pk}" if pk else ""))

    # processed_at-defaultit: PG:ssa DEFAULT NOW(); analyysipalvelut eivat aseta
    # processed_at:ia US/XR-INSERTeissa, joten lisataan DB-tason default.
    defaults = [
        ("ultrasound", "DF_us_pa", "SYSDATETIMEOFFSET()"),
        ("xray_analysis", "DF_xr_pa", "SYSDATETIME()"),
        ("ct_analysis", "DF_ct_pa", "SYSDATETIME()"),
    ]
    lines.append("-- processed_at-defaultit (idempotentti)")
    for t, cname, fn in defaults:
        if t in tables:
            lines.append(f"IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name='{cname}')")
            lines.append(f"    ALTER TABLE [{t}] ADD CONSTRAINT [{cname}] DEFAULT {fn} FOR [processed_at];")
    lines.append("")

    # Rekisteritaulut (devices/institutions) — eivat ole PG:ssa, tulevaa kayttoa varten.
    # Admin-endpointit (/devices, /institutions) kyselevat naita; ilman tauluja -> 500.
    lines.append("-- Rekisteritaulut (laite-/instituutiorekisteri, tuleva ominaisuus)")
    lines.append("""IF OBJECT_ID('institutions','U') IS NULL
CREATE TABLE [institutions] (
    [id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_institutions] PRIMARY KEY,
    [name] NVARCHAR(255) NULL,
    [region] NVARCHAR(255) NULL,
    [address] NVARCHAR(MAX) NULL,
    [contact_info] NVARCHAR(MAX) NULL,
    [is_active] BIT NULL CONSTRAINT [DF_inst_active] DEFAULT 1
);""")
    lines.append("""IF OBJECT_ID('devices','U') IS NULL
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
);""")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    cur.close(); conn.close()
    print(f"\nKirjoitettu: {OUT}  ({len(tables)} taulua)")


if __name__ == "__main__":
    main()
