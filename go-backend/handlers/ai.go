package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
)

type askAIRequest struct {
	Question string `json:"question"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIPayload struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Temperature float64         `json:"temperature"`
	MaxTokens   int             `json:"max_tokens"`
}

const aiSystemPrompt = "You are an expert in medical imaging quality control. You specialize in explaining numerical QA results from ultrasound, X-ray and CT images (s_depth, u_cov, u_skew, uniformity, MTF, HU values). Keep your answers concise — aim for 4 to 6 sentences. Always respond in the same language as the user's question."

func AskAI(w http.ResponseWriter, r *http.Request) {
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

	payload := openAIPayload{
		Model: "gpt-4o",
		Messages: []openAIMessage{
			{Role: "system", Content: aiSystemPrompt},
			{Role: "user", Content: req.Question},
		},
		Temperature: 0.5,
		MaxTokens:   300,
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

func ReportSlackIssue(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
		http.Error(w, "missing text", http.StatusBadRequest)
		return
	}

	webhookURL := os.Getenv("SLACK_WEBHOOK_URL")
	if webhookURL == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "Slack webhook not configured"}) //nolint:errcheck
		return
	}

	body, _ := json.Marshal(map[string]string{"text": req.Text})
	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body)) //nolint:gosec
	if err != nil {
		http.Error(w, "Slack request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"}) //nolint:errcheck
}
