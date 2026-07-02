package config

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"

	_ "github.com/microsoft/go-mssqldb"
)

// ConnectDB avaa yhteyden Microsoft SQL Serveriin (database/sql + go-mssqldb).
func ConnectDB() (*sql.DB, error) {
	host := getEnv("DATABASE_HOST", "localhost")
	port := getEnv("DATABASE_PORT", "1433")
	user := getEnv("DATABASE_USER", "sa")
	pass := os.Getenv("DATABASE_PASSWORD")
	name := getEnv("DATABASE_NAME", "QA-results")

	u := &url.URL{
		Scheme: "sqlserver",
		User:   url.UserPassword(user, pass),
		Host:   fmt.Sprintf("%s:%s", host, port),
	}
	q := u.Query()
	q.Set("database", name)
	q.Set("encrypt", "true")
	q.Set("TrustServerCertificate", "true")
	u.RawQuery = q.Encode()

	db, err := sql.Open("sqlserver", u.String())
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %w", err)
	}
	db.SetMaxOpenConns(10)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("db ping: %w", err)
	}
	return db, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
