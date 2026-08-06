r"""Kevyt ETL: kopioi olemassa oleva data PostgreSQL -> MSSQL.

Säilyttää jatkuvuuden Go-migraation aikana (UI toimii MSSQL:ää vasten heti).
Myöhemmin analyysit ajetaan uudelleen Orthanc-datasta tuoreen datan saamiseksi.

Muunnokset: JSONB/array (dict/list) -> json-string, bytea (memoryview) -> bytes,
bool -> 0/1. Säilyttää id:t (SET IDENTITY_INSERT).

Käyttö:
    python scripts/migrate_pg_to_mssql.py [--truncate]
"""
import argparse
import json
from pathlib import Path

import psycopg2
import pymssql

ROOT = Path(__file__).resolve().parent.parent
env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip()

PG = dict(host="localhost", port=15432, dbname="QA-results",
          user="postgres", password=env.get("DATABASE_PASSWORD", ""))
MS = dict(server="localhost", port=11433, user="sa",
          password=env.get("MSSQL_SA_PASSWORD", ""), database="QA-results")

EXCLUDE_PREFIX = ("django_", "auth_")


def convert(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    if isinstance(v, memoryview):
        return bytes(v)
    if isinstance(v, bool):
        return 1 if v else 0
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truncate", action="store_true", help="tyhjennä MSSQL-taulut ensin")
    ap.add_argument("--only", nargs="+", help="ETL vain nämä taulut (esim. xray_analysis)")
    args = ap.parse_args()

    pg = psycopg2.connect(**PG); pgc = pg.cursor()
    ms = pymssql.connect(**MS); msc = ms.cursor()

    pgc.execute("""SELECT table_name FROM information_schema.tables
                   WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name""")
    tables = [t for (t,) in pgc.fetchall() if not t.startswith(EXCLUDE_PREFIX)]
    if args.only:
        tables = [t for t in tables if t in args.only]

    total = 0
    for t in tables:
        # PG: lue sarakkeet + rivit
        pgc.execute("""SELECT column_name FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position""", (t,))
        cols = [r[0] for r in pgc.fetchall()]
        pgc.execute(f'SELECT {", ".join(chr(34)+c+chr(34) for c in cols)} FROM "{t}"')
        rows = pgc.fetchall()
        if not rows:
            print(f"  {t}: 0 riviä")
            continue

        # MSSQL: onko identity-sarake?
        msc.execute("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(%s) AND is_identity=1", (t,))
        has_identity = msc.fetchone() is not None

        if args.truncate:
            msc.execute(f"DELETE FROM [{t}]")

        collist = ", ".join(f"[{c}]" for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        sql = f"INSERT INTO [{t}] ({collist}) VALUES ({placeholders})"

        if has_identity:
            msc.execute(f"SET IDENTITY_INSERT [{t}] ON")
        n = 0
        for row in rows:
            msc.execute(sql, tuple(convert(v) for v in row))
            n += 1
        if has_identity:
            msc.execute(f"SET IDENTITY_INSERT [{t}] OFF")
        ms.commit()
        total += n
        print(f"  {t}: {n} riviä siirretty" + ("  (identity)" if has_identity else ""))

    pgc.close(); pg.close(); msc.close(); ms.close()
    print(f"\nValmis. Yhteensä {total} riviä PG -> MSSQL.")


if __name__ == "__main__":
    main()
