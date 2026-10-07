package handlers

// S3-yhteensopiva object storage -lukupuoli (manuscript §2.2.5 / §2.2.6).
// Workerit tallentavat analyysikuvat S3:een (SeaweedFS/MinIO/any) ja kirjaavat
// s3://bucket/key -polun ultrasound.output_image_path -sarakkeeseen. Backend
// tarjoilee kuvat proxaamalla (toimii vaikkei S3 olisi selaimelle näkyvä) tai
// presigned URL:llä (ohjeen mukainen tapa, jos S3 on julkisesti tavoitettavissa).

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

func s3Endpoint() string {
	if e := os.Getenv("S3_ENDPOINT"); e != "" {
		return e
	}
	return "http://object-storage:8333"
}

var s3ClientSingleton *s3.Client

func getS3Client() (*s3.Client, error) {
	if s3ClientSingleton != nil {
		return s3ClientSingleton, nil
	}
	region := os.Getenv("S3_REGION")
	if region == "" {
		region = "us-east-1"
	}
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), "")),
	)
	if err != nil {
		return nil, err
	}
	cl := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(s3Endpoint())
		o.UsePathStyle = true // SeaweedFS/MinIO eivät tue vhost-bucket-DNS:ää
	})
	s3ClientSingleton = cl
	return cl, nil
}

// parseS3Path purkaa "s3://bucket/key" -> (bucket, key).
func parseS3Path(p string) (bucket, key string, ok bool) {
	rest, found := strings.CutPrefix(p, "s3://")
	if !found {
		return "", "", false
	}
	i := strings.IndexByte(rest, '/')
	if i <= 0 || i == len(rest)-1 {
		return "", "", false
	}
	return rest[:i], rest[i+1:], true
}

// usOutputImagePath hakee ultrasound.output_image_path -arvon instanssille.
func usOutputImagePath(ctx context.Context, db *sql.DB, instance string) (string, bool) {
	var p *string
	err := db.QueryRowContext(ctx,
		`SELECT TOP 1 output_image_path FROM ultrasound WHERE instance = @p1 AND output_image_path IS NOT NULL`,
		instance).Scan(&p)
	if err != nil || p == nil || *p == "" {
		return "", false
	}
	return *p, true
}

// USAnalysisImage proxaa analyysikuvan S3:sta (oletus — toimii aina, ei vaadi
// S3:n näkymistä selaimelle). GET /us/analysis-image/{instance}
func USAnalysisImage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		instance := chi.URLParam(r, "instance")
		path, ok := usOutputImagePath(r.Context(), db, instance)
		if !ok {
			http.NotFound(w, r)
			return
		}
		bucket, key, ok := parseS3Path(path)
		if !ok {
			http.Error(w, "invalid s3 path", http.StatusInternalServerError)
			return
		}
		cl, err := getS3Client()
		if err != nil {
			http.Error(w, "s3 init: "+err.Error(), http.StatusInternalServerError)
			return
		}
		out, err := cl.GetObject(r.Context(), &s3.GetObjectInput{Bucket: &bucket, Key: &key})
		if err != nil {
			http.Error(w, "s3 get: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer out.Body.Close()
		ct := "image/png"
		if out.ContentType != nil && *out.ContentType != "" {
			ct = *out.ContentType
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "no-cache")
		io.Copy(w, out.Body) //nolint:errcheck
	}
}

// USAnalysisImageURL palauttaa presigned GET -URL:n (ohjeen §2.2.6 mukainen tapa).
// Toimii selaimesta vain jos S3-endpoint on julkisesti tavoitettavissa.
// GET /us/analysis-image-url/{instance}
func USAnalysisImageURL(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		instance := chi.URLParam(r, "instance")
		path, ok := usOutputImagePath(r.Context(), db, instance)
		if !ok {
			http.NotFound(w, r)
			return
		}
		bucket, key, ok := parseS3Path(path)
		if !ok {
			http.Error(w, "invalid s3 path", http.StatusInternalServerError)
			return
		}
		cl, err := getS3Client()
		if err != nil {
			http.Error(w, "s3 init: "+err.Error(), http.StatusInternalServerError)
			return
		}
		ps := s3.NewPresignClient(cl)
		req, err := ps.PresignGetObject(r.Context(),
			&s3.GetObjectInput{Bucket: &bucket, Key: &key},
			s3.WithPresignExpires(15*time.Minute))
		if err != nil {
			http.Error(w, "presign: "+err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": req.URL}) //nolint:errcheck
	}
}
