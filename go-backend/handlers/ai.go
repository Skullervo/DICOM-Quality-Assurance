// ai.go — AI-avusteinen QA-selitys (OpenAI GPT-4o).
//
// Mihin: käyttäjä voi kysyä tekoälyltä QA-tuloksista (/ask-ai). Jos pyynnössä on
// laite (station) + modaliteetti, backend hakee laitteen viimeisimmät mittaukset
// DB:stä ja antaa ne GPT:lle kontekstiksi, jolloin vastaus tulkitsee trendin eikä
// vain toista lukuja. API-avain luetaan ympäristömuuttujasta OPENAI_API_KEY.
package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// Pyynnön runko: käyttäjän kysymys + valinnainen laitekonteksti.
type askAIRequest struct {
	Question string `json:"question"`
	// Valinnainen konteksti: jos annettu, backend hakee laitteen viimeisimmät
	// mittaukset ja kontekstoi vastauksen (manuscript §2.2.6 — ei pelkkä yhteenveto).
	Station  string `json:"station"`
	Modality string `json:"modality"`
}

// OpenAI Chat Completions -rajapinnan muodot (yksi viesti = rooli + sisältö).
type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Koko OpenAI-kutsun runko: malli, viestit, lämpötila (satunnaisuus) ja token-katto.
type openAIPayload struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Temperature float64         `json:"temperature"`
	MaxTokens   int             `json:"max_tokens"`
}

// Järjestelmäprompti: ohjeistaa GPT:n asiantuntijarooliin ja vastaustyyliin.
const aiSystemPrompt = "You are an expert in medical imaging quality control. You specialize in explaining numerical QA results from ultrasound, X-ray and CT images (s_depth, u_cov, u_skew, uniformity, MTF, HU values). When measurement context is provided, interpret the trend and flag anomalies — do not merely restate the numbers. Keep your answers concise — aim for 4 to 6 sentences. Always respond in the same language as the user's question."

// usMeasurementContext hakee laitteen viimeisimmät US-mittaukset ja muotoilee ne
// GPT:lle annettavaksi kontekstiksi (trendi + anomaliat).
func usMeasurementContext(db *sql.DB, station string) string {
	rows, err := db.QueryContext(context.Background(),
		`SELECT TOP 10 studydate, s_depth, u_cov, u_skew, tranducertype
		 FROM ultrasound WHERE stationname = @p1 ORDER BY processed_at DESC`, station)
	if err != nil {
		return ""
	}
	defer rows.Close()
	var b strings.Builder
	b.WriteString("Recent ultrasound QA measurements for station " + station + " (newest first):\n")
	n := 0
	for rows.Next() {
		var date, probe *string
		var sd, uc, us *float64
		if rows.Scan(&date, &sd, &uc, &us, &probe) != nil {
			continue
		}
		b.WriteString(fmt.Sprintf("- %s probe=%s s_depth=%s u_cov=%s u_skew=%s\n",
			deref(date), deref(probe), fnum(sd), fnum(uc), fnum(us)))
		n++
	}
	if n == 0 {
		return ""
	}
	return b.String()
}

func deref(s *string) string {
	if s == nil {
		return "?"
	}
	return *s
}
func fnum(f *float64) string {
	if f == nil {
		return "?"
	}
	return fmt.Sprintf("%.3f", *f)
}

func AskAI(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req askAIRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Question == "" {
			http.Error(w, "missing question", http.StatusBadRequest)
			return
		}

		apiKey := os.Getenv("OPENAI_API_KEY")
		if apiKey == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"error": "OpenAI API key not configured"}) //nolint:errcheck
			return
		}

		// Kontekstointi: hae mittaukset jos laite + modaliteetti annettu.
		userContent := req.Question
		if req.Station != "" && strings.EqualFold(req.Modality, "US") && db != nil {
			if ctx := usMeasurementContext(db, req.Station); ctx != "" {
				userContent = ctx + "\nQuestion: " + req.Question
			}
		}

		payload := openAIPayload{
			Model: "gpt-4o",
			Messages: []openAIMessage{
				{Role: "system", Content: aiSystemPrompt},
				{Role: "user", Content: userContent},
			},
			Temperature: 0.5,
			MaxTokens:   400,
		}

		body, _ := json.Marshal(payload)
		httpReq, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(body))
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(httpReq)
		if err != nil {
			http.Error(w, "OpenAI request failed", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)

		var result struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(respBody, &result); err != nil {
			http.Error(w, "OpenAI parse error", http.StatusBadGateway)
			return
		}
		if result.Error != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": result.Error.Message}) //nolint:errcheck
			return
		}
		if len(result.Choices) == 0 {
			http.Error(w, "no choices returned", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"answer": result.Choices[0].Message.Content}) //nolint:errcheck
	}
}

// modalityWebhook valitsee modaliteettikohtaisen Slack-webhookin (manuscript §2.2.6:
// viestit modaliteettivastaaville). Fallback: yleinen SLACK_WEBHOOK_URL.
func modalityWebhook(modality string) string {
	switch strings.ToUpper(strings.TrimSpace(modality)) {
	case "US":
		if v := os.Getenv("SLACK_WEBHOOK_US"); v != "" {
			return v
		}
	case "CT":
		if v := os.Getenv("SLACK_WEBHOOK_CT"); v != "" {
			return v
		}
	case "CR", "DX", "XR", "XRAY":
		if v := os.Getenv("SLACK_WEBHOOK_XR"); v != "" {
			return v
		}
	}
	return os.Getenv("SLACK_WEBHOOK_URL")
}

func ReportSlackIssue(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text     string `json:"text"`
		Modality string `json:"modality"`
		Station  string `json:"station"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
		http.Error(w, "missing text", http.StatusBadRequest)
		return
	}

	webhookURL := modalityWebhook(req.Modality)
	if webhookURL == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "Slack webhook not configured"}) //nolint:errcheck
		return
	}

	text := req.Text
	if req.Station != "" {
		text = fmt.Sprintf("*[%s %s]* %s", strings.ToUpper(req.Modality), req.Station, req.Text)
	}
	body, _ := json.Marshal(map[string]string{"text": text})
	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body)) //nolint:gosec
	if err != nil {
		http.Error(w, "Slack request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"}) //nolint:errcheck
}
