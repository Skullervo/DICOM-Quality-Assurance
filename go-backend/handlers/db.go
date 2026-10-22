// handlers/db.go: tietokannan yleiset apufunktiot handlereille.
//
// Monet handlerit palauttavat rivit sellaisenaan JSONina tietämättä tarkkaa
// sarakejoukkoa etukäteen. scanMaps lukee kaikki rivit map[string]any -muotoon,
// ja reparseJSON palauttaa JSON-tekstinä tallennetut sarakkeet takaisin oikeaksi
// rakenteeksi. Tämä korvaa aiemman pgx-pohjaisen (PostgreSQL) toteutuksen nyt kun
// kanta on MS SQL Server.
package handlers

import (
	"database/sql"
	"encoding/json"
)

// jsonColumns: sarakkeet jotka olivat PostgreSQLssä JSONB ja MSSQL:ssä NVARCHAR(MAX).
// Parsitaan takaisin JSON-arvoksi, jotta API palauttaa rakenteen (array/objekti),
// ei JSON-merkkijonoa.
var jsonColumns = map[string]bool{
	"horiz_prof": true, "vert_prof": true, "u_low": true,
	"low_contrast_details": true, "mtf_data": true, "hu_roi_map": true,
}

// scanMaps lukee kaikki rivit []map[string]any -muotoon.
// Korvaa pgx:n rows.Values() + rows.FieldDescriptions() -kuvion database/sql:lle.
func scanMaps(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var out []map[string]any
	for rows.Next() {
		// Scan vaatii osoittimet; luodaan arvotaulukko (vals) ja osoitintaulukko (ptrs)
		// joka osoittaa siihen. Näin voidaan skannata ennalta tuntematon sarakejoukko.
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				v = string(b) // NVARCHAR/teksti voi palautua []byte:nä -> muunna merkkijonoksi
			}
			if jsonColumns[c] {
				v = reparseJSON(v)
			}
			m[c] = v
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// reparseJSON muuntaa JSON-merkkijonon takaisin Go-arvoksi (array/objekti).
func reparseJSON(v any) any {
	s, ok := v.(string)
	if !ok || s == "" {
		return v
	}
	var parsed any
	if err := json.Unmarshal([]byte(s), &parsed); err == nil {
		return parsed
	}
	return v
}
