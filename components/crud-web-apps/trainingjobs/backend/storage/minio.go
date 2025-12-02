package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// MinIOClient wraps MinIO client with bucket management
type MinIOClient struct {
	client    *minio.Client
	k8sClient *kubernetes.Clientset
}

// MinIOConfig holds MinIO connection configuration
type MinIOConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
}

// NewMinIOClientFromK8s creates a MinIO client using credentials from Kubernetes secret
func NewMinIOClientFromK8s(ctx context.Context, k8sClient *kubernetes.Clientset, namespace string) (*MinIOClient, error) {
	// Try multiple secret names in order of preference
	secretNames := []string{"minio-secret", "mlpipeline-minio-artifact"}
	var secret *corev1.Secret
	var err error

	for _, secretName := range secretNames {
		secret, err = k8sClient.CoreV1().Secrets(namespace).Get(ctx, secretName, metav1.GetOptions{})
		if err == nil {
			log.Printf("Found MinIO secret: %s in namespace %s", secretName, namespace)
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get MinIO secret (tried: %v): %w", secretNames, err)
	}

	// Support both naming conventions:
	// - Standard: endpoint, accesskey, secretkey
	// - AWS-style: S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
	endpoint := string(secret.Data["endpoint"])
	if endpoint == "" {
		endpoint = string(secret.Data["S3_ENDPOINT"])
	}
	
	accessKey := string(secret.Data["accesskey"])
	if accessKey == "" {
		accessKey = string(secret.Data["AWS_ACCESS_KEY_ID"])
	}
	
	secretKey := string(secret.Data["secretkey"])
	if secretKey == "" {
		secretKey = string(secret.Data["AWS_SECRET_ACCESS_KEY"])
	}

	if endpoint == "" || accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("MinIO secret is missing required fields (need endpoint or accesskey/secretkey)")
	}

	// Remove http:// or https:// prefix if present (MinIO client doesn't want it)
	endpoint = strings.TrimPrefix(endpoint, "http://")
	endpoint = strings.TrimPrefix(endpoint, "https://")

	// Initialize MinIO client
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false, // Set to true if using HTTPS
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize MinIO client: %w", err)
	}

	log.Printf("MinIO client initialized for namespace %s (endpoint: %s)", namespace, endpoint)

	return &MinIOClient{
		client:    minioClient,
		k8sClient: k8sClient,
	}, nil
}

// NewMinIOClient creates a MinIO client with explicit configuration
func NewMinIOClient(config MinIOConfig) (*MinIOClient, error) {
	minioClient, err := minio.New(config.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(config.AccessKey, config.SecretKey, ""),
		Secure: config.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize MinIO client: %w", err)
	}

	return &MinIOClient{
		client:    minioClient,
		k8sClient: nil,
	}, nil
}

// EnsureBucket creates a bucket if it doesn't exist
func (m *MinIOClient) EnsureBucket(ctx context.Context, bucketName string) error {
	exists, err := m.client.BucketExists(ctx, bucketName)
	if err != nil {
		return fmt.Errorf("failed to check if bucket exists: %w", err)
	}

	if !exists {
		log.Printf("Creating MinIO bucket: %s", bucketName)
		err = m.client.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
		log.Printf("Bucket %s created successfully", bucketName)
	} else {
		log.Printf("Bucket %s already exists", bucketName)
	}

	return nil
}

// UploadFile uploads a file to MinIO
func (m *MinIOClient) UploadFile(ctx context.Context, bucketName, objectName string, reader io.Reader, size int64, contentType string) (minio.UploadInfo, error) {
	// Ensure bucket exists
	if err := m.EnsureBucket(ctx, bucketName); err != nil {
		return minio.UploadInfo{}, err
	}

	// Upload the file
	uploadInfo, err := m.client.PutObject(ctx, bucketName, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return minio.UploadInfo{}, fmt.Errorf("failed to upload file: %w", err)
	}

	log.Printf("File uploaded successfully: %s/%s (size: %d bytes)", bucketName, objectName, uploadInfo.Size)
	return uploadInfo, nil
}

// GetObject retrieves an object from MinIO
func (m *MinIOClient) GetObject(ctx context.Context, bucketName, objectName string) (*minio.Object, error) {
	object, err := m.client.GetObject(ctx, bucketName, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get object: %w", err)
	}
	return object, nil
}

// DeleteObject deletes an object from MinIO
func (m *MinIOClient) DeleteObject(ctx context.Context, bucketName, objectName string) error {
	err := m.client.RemoveObject(ctx, bucketName, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}
	log.Printf("Object deleted: %s/%s", bucketName, objectName)
	return nil
}

// ListObjects lists objects in a bucket with a prefix
func (m *MinIOClient) ListObjects(ctx context.Context, bucketName, prefix string) <-chan minio.ObjectInfo {
	return m.client.ListObjects(ctx, bucketName, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})
}
