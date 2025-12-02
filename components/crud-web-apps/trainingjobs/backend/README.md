# ML Platform Training Job Backend

Go backend service for ML Platform that converts training job configurations to Kubernetes RayJob resources with Tensorboard integration.

## Version

**v2.1.0** - Current stable release

## Overview

This backend service:
- Receives training job requests from the frontend
- Converts job configurations to RayJob CRDs
- Creates corresponding Tensorboard resources
- Manages MinIO storage integration for training data
- Deploys resources to Kubernetes/Kubeflow

## Features

- **RayJob Conversion**: Transform frontend forms into RayJob CRDs with TRAINING_CONFIG
- **Tensorboard Integration**: Automatically create Tensorboard CRD on job submission
- **MinIO Storage**: Upload training data and configurations to MinIO
- **XGBoost Support**: Full hyperparameter mapping for XGBoost training jobs
- **Flexible Configuration**: Environment-based configuration

## Prerequisites

- Go 1.23+
- Kubernetes cluster with Kubeflow installed
- RayJob CRD (ray.io/v1)
- Tensorboard CRD (tensorboard.kubeflow.org/v1alpha1)
- MinIO storage with secret (`minio-secret`)
- Docker (for containerized deployment)

## Configuration

Environment variables:

```bash
# Kubernetes config (optional, uses in-cluster config if not set)
export KUBECONFIG=/path/to/kubeconfig

# MinIO configuration (via kubernetes secret 'minio-secret')
# Supports both formats:
# Format 1: S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# Format 2: endpoint, accesskey, secretkey

# Server port
export PORT=8080
```

## Project Structure

```
backend/
├── main.go                 # Application entry point
├── go.mod                  # Go module definition
├── converter/              # Resource conversion
│   └── converter.go        # RayJob and Tensorboard converter
├── handlers/               # HTTP request handlers
│   └── handlers.go         # REST API handlers
├── k8s/                    # Kubernetes client
│   └── client.go           # K8s operations
├── models/                 # API models
│   └── models.go           # Request/response structures
├── storage/                # Storage integration
│   └── minio.go            # MinIO client
└── Dockerfile              # Container image definition
```

## API Endpoints

### Training Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/jobs` | Create a new training job |
| GET | `/api/v1/jobs` | List all training jobs |
| GET | `/api/v1/jobs/:id` | Get job details |
| DELETE | `/api/v1/jobs/:id` | Delete a training job |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health status |

## RayJob Configuration

The converter generates TRAINING_CONFIG environment variable with:

```json
{
  "Input": [
    {
      "name": "training-data",
      "type": "minio",
      "endpoint": "minio-endpoint",
      "bucket": "bucket-name",
      "path": "path/to/data",
      "accessKey": "...",
      "secretKey": "..."
    }
  ],
  "Output": [
    {
      "name": "output-path",
      "bucket": "output-bucket",
      "path": "path/to/output"
    }
  ],
  "Checkpoint": {
    "name": "checkpoint-path",
    "bucket": "checkpoint-bucket",
    "path": "path/to/checkpoint"
  },
  "Hyperparams": {
    "nthread": 4,
    "num_workers": 2,
    "updater": "auto",
    "eta": 0.3,
    "max_depth": 6,
    "n_estimators": 100,
    "objective": "multi:softmax"
  }
}
```

## Tensorboard Integration

On job submission, the backend automatically creates a Tensorboard CRD:

```yaml
apiVersion: tensorboard.kubeflow.org/v1alpha1
kind: Tensorboard
metadata:
  name: tb-<job-id>
  namespace: <user-namespace>
spec:
  logspath: s3://<bucket>/<checkpoint-path>
```

## Building

### Local Development

```bash
cd backend
go mod download
go mod tidy
go build -o ml-platform-backend .
./ml-platform-backend
```

### Docker Build

```bash
docker build -t loihoangthanh1411/ml-platform-backend:v2.1.0 .
docker push loihoangthanh1411/ml-platform-backend:v2.1.0
```

## Deployment

Apply the deployment manifest:

```bash
kubectl apply -f manifests/deployment.yaml
```

## Testing

```bash
# Run tests
go test ./...

# Run with coverage
go test -cover ./...
```

## Troubleshooting

### MinIO Connection Issues

Check the `minio-secret` in the namespace:
```bash
kubectl get secret minio-secret -n kubeflow -o yaml
```

The secret should contain either:
- `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (AWS format)
- `endpoint`, `accesskey`, `secretkey` (custom format)

### RayJob Not Created

Check backend logs:
```bash
kubectl logs -n kubeflow -l component=backend
```

### Tensorboard Not Created

Tensorboard creation failures are logged as warnings but don't block job creation:
```bash
kubectl logs -n kubeflow -l component=backend | grep -i tensorboard
```

## License

Apache 2.0
