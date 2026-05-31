package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// httpClient is the shared HTTP client, configured at startup.
var httpClient *http.Client

func initHTTPClient(insecure bool) {
	transport := &http.Transport{}
	if insecure {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	httpClient = &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}
}

// apiPost sends a JSON POST to url with the given payload and decodes the
// response into dst (if non-nil). Returns the HTTP status code and any error.
func apiPost(url string, payload any, dst any) (int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+authToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("do: %w", err)
	}
	defer resp.Body.Close()

	if dst != nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
			return resp.StatusCode, fmt.Errorf("decode: %w", err)
		}
	} else {
		io.Copy(io.Discard, resp.Body) //nolint:errcheck
	}

	return resp.StatusCode, nil
}
