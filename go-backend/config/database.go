// config/database.go: tietokantayhteyden avaaminen.
//
// Backendin AINOA tietokanta on Microsoft SQL Server (QA-results), johon gRPC-
// analyysipalvelut kirjoittavat QA-tulokset. Tässä muodostetaan yhteysmerkkijono
// ympäristömuuttujista ja avataan yhteyspooli, jota kaikki handlerit jakavat.
// Alaviivalla importattu go-mssqldb rekisteröi "sqlserver"-ajurin database/sql:lle.
package config

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"

	_ "github.com/microsoft/go-mssqldb" // rekisteröi "sqlserver"-ajurin (sivuvaikutus-import)
)

// ConnectDB avaa yhteyden Microsoft SQL Serveriin (database/sql + go-mssqldb).
// Palauttaa valmiin yhteyspoolin (*sql.DB) tai virheen, jos yhteyttä ei saada.
func ConnectDB() (*sql.DB, error) {
	// Yhteysasetukset ympäristömuuttujista; jos puuttuvat, käytetään oletusta.
	// Salasanalle ei ole oletusta (ei saa kovakoodata) -> luetaan suoraan.
	host := getEnv("DATABASE_HOST", "localhost")
	port := getEnv("DATABASE_PORT", "1433")
	user := getEnv("DATABASE_USER", "sa")
	pass := os.Getenv("DATABASE_PASSWORD")
	name := getEnv("DATABASE_NAME", "QA-results")

	// Rakennetaan yhteys-URL muodossa:
	//   sqlserver://user:pass@host:port?database=...&encrypt=true&TrustServerCertificate=true
	// net/url hoitaa erikoismerkkien (esim. salasanan) oikean enkoodauksen.
	u := &url.URL{
		Scheme: "sqlserver",
		User:   url.UserPassword(user, pass),
		Host:   fmt.Sprintf("%s:%s", host, port),
	}
	q := u.Query()
	q.Set("database", name)
	q.Set("encrypt", "true")                  // salattu yhteys (TLS)
	q.Set("TrustServerCertificate", "true")   // hyväksy itse allekirjoitettu palvelinsertifikaatti
	u.RawQuery = q.Encode()

	// sql.Open ei vielä avaa yhteyttä, vaan valmistelee yhteyspoolin.
	db, err := sql.Open("sqlserver", u.String())
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %w", err)
	}
	db.SetMaxOpenConns(10) // rajoita samanaikaisten yhteyksien määrä poolissa
	// Ping avaa ja testaa oikean yhteyden. Jos se ei onnistu, suljetaan pooli ja
	// palautetaan virhe, jolloin main.go sammuttaa palvelun.
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("db ping: %w", err)
	}
	return db, nil
}

// getEnv palauttaa ympäristömuuttujan arvon, tai fallbackin jos muuttuja on tyhjä/asettamatta.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
