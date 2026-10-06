"""MSSQL-yhteys (pymssql). Lukee samaa QA-results-kantaa kuin Go-backend.

Ympäristömuuttujat (samat nimet kuin Go-backendissä / analyysipalveluissa):
  DATABASE_HOST (oletus localhost), DATABASE_PORT (1433),
  DATABASE_USER (sa), DATABASE_PASSWORD, DATABASE_NAME (QA-results).

Paikallisesti Podman mappaa MSSQL:n host-porttiin 11433, joten aja esim.:
  DATABASE_HOST=localhost DATABASE_PORT=11433 DATABASE_PASSWORD=... uvicorn ...
"""
import os
import contextlib
import pymssql

DB_CONFIG = {
    "server": os.getenv("DATABASE_HOST", "localhost"),
    "port": os.getenv("DATABASE_PORT", "1433"),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "database": os.getenv("DATABASE_NAME", "QA-results"),
}


def connect():
    return pymssql.connect(**DB_CONFIG)


@contextlib.contextmanager
def cursor(as_dict=True):
    """Yhteys + kursori kontekstinhallinnalla. as_dict -> rivit dict-muodossa."""
    conn = connect()
    try:
        cur = conn.cursor(as_dict=as_dict)
        yield cur, conn
    finally:
        conn.close()


def query(sql, params=None, as_dict=True):
    """Aja SELECT ja palauta kaikki rivit."""
    with cursor(as_dict=as_dict) as (cur, _conn):
        cur.execute(sql, params or ())
        return cur.fetchall()


def query_one(sql, params=None, as_dict=True):
    rows = query(sql, params, as_dict)
    return rows[0] if rows else None


def execute(sql, params=None):
    """Aja INSERT/UPDATE/DELETE ja commitoi."""
    with cursor() as (cur, conn):
        cur.execute(sql, params or ())
        conn.commit()
        return cur.rowcount
