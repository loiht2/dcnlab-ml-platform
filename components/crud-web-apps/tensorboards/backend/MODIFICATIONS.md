# Backend Modifications

## Overview
The backend has been modified to support enhanced S3-compatible object store configuration, particularly for MinIO integration with automatic credential injection via PodDefaults.

## Modified Files

### 1. `app/utils.py`

#### Changes Made

**Function: `get_tensorboard_dict(namespace, body)`**

Added logic to:

1. **Add Tensorboard Label for PodDefault Matching**
   ```python
   labels["tensorboards"] = "true"
   ```
   - This label is automatically added to all Tensorboard CRs
   - Enables PodDefaults with matching selector to inject credentials
   - Required for automatic MinIO/S3 credential injection

2. **Add S3 Endpoint Annotation**
   ```python
   if body["logspath"].startswith("s3://"):
       if "annotations" not in metadata:
           metadata["annotations"] = {}
       
       if "endpoint" in body and body["endpoint"]:
           endpoint_value = body["endpoint"]
           # Convert display value 'minio-system' to full URL
           if endpoint_value == "minio-system":
               endpoint_value = "http://minio.minio-system.svc.cluster.local:9000"
           metadata["annotations"]["s3-endpoint"] = endpoint_value
   ```
   - Adds `s3-endpoint` annotation to Tensorboard CR metadata when using S3 storage
   - Converts user-friendly endpoint name `minio-system` to full MinIO service URL
   - Stores endpoint information for tracking and potential future use

## Request Body Changes

The backend now accepts additional optional fields in the POST request body for creating Tensorboards:

```json
{
  "name": "tensorboard-name",
  "logspath": "s3://bucket/prefix",
  "configurations": ["poddefault-label1", "poddefault-label2"],
  "storageProvider": "minio",
  "bucket": "my-bucket",
  "prefix": "output/logs",
  "endpoint": "minio-system"
}
```

### New Optional Fields:
- `storageProvider`: Storage provider type ("minio" or "s3")
- `bucket`: S3 bucket name
- `prefix`: Path prefix within the bucket
- `endpoint`: Endpoint URL or identifier

**Note**: The `logspath` field is still the primary field used by the Tensorboard CR spec. The additional fields are used for annotation and metadata purposes.

## Generated Tensorboard CR

With the modifications, the backend generates Tensorboard CRs in this format:

```yaml
apiVersion: tensorboard.kubeflow.org/v1alpha1
kind: Tensorboard
metadata:
  name: tensorboard-name
  namespace: kubeflow-user-example-com
  labels:
    tensorboards: "true"
    # Additional labels from configurations array (PodDefault labels)
  annotations:
    s3-endpoint: "http://minio.minio-system.svc.cluster.local:9000"
spec:
  logspath: s3://my-bucket/output/logs
```

## PodDefault Integration

### How It Works

1. **Label Matching**: The `tensorboards: "true"` label on the Tensorboard CR enables PodDefault admission webhook to match and inject configurations

2. **Credential Injection**: When a PodDefault has a selector matching `tensorboards: "true"`, it automatically injects:
   - Environment variables (e.g., `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`)
   - Volume mounts
   - Service account configurations
   - Other pod specifications defined in the PodDefault

3. **Controller Processing**: The Tensorboard controller creates pods from the CR, and the PodDefault webhook injects credentials before pod creation

### Example PodDefault

```yaml
apiVersion: kubeflow.org/v1alpha1
kind: PodDefault
metadata:
  name: add-minio-secret
  namespace: kubeflow-user-example-com
spec:
  desc: Add MinIO credentials
  selector:
    matchLabels:
      tensorboards: "true"  # Matches our label
  env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: minio-secret
        key: AWS_ACCESS_KEY_ID
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: minio-secret
        key: AWS_SECRET_ACCESS_KEY
  - name: S3_ENDPOINT
    valueFrom:
      secretKeyRef:
        name: minio-secret
        key: S3_ENDPOINT
```

## Dependencies

- **Python Packages**: No new dependencies added
- **Kubernetes Resources**: 
  - PodDefault CRD (from Kubeflow)
  - Secret containing MinIO/S3 credentials
- **Services**: MinIO service accessible within the cluster

## Testing

To verify the backend changes:

1. Create a Tensorboard via the API:
   ```bash
   curl -X POST http://localhost:5000/api/namespaces/kubeflow-user-example-com/tensorboards \
     -H "Content-Type: application/json" \
     -d '{
       "name": "test-tb",
       "logspath": "s3://test-bucket/logs",
       "configurations": [],
       "storageProvider": "minio",
       "bucket": "test-bucket",
       "prefix": "logs",
       "endpoint": "minio-system"
     }'
   ```

2. Verify the created Tensorboard CR has the correct labels and annotations:
   ```bash
   kubectl get tensorboard test-tb -n kubeflow-user-example-com -o yaml
   ```

3. Check that the pod has injected environment variables:
   ```bash
   kubectl get pod -l app=test-tb -n kubeflow-user-example-com -o jsonpath='{.items[0].spec.containers[?(@.name=="tensorboard")].env}'
   ```

## Backward Compatibility

The changes are fully backward compatible:
- Existing Tensorboards without these labels/annotations continue to work
- The `logspath` field remains the primary configuration
- Additional fields are optional and only used for enhanced functionality
- PodDefault injection only occurs when matching labels are present

## Troubleshooting

### RBAC Access Denied Error

**Symptom**: HTTP 403 error with "RBAC: access denied" when accessing Tensorboard through browser.

**Root Cause Analysis**:

This error occurs when the Tensorboard pod lacks AWS credentials to authenticate with MinIO S3 storage. The issue chain is:

1. **Without Label**: Tensorboard CR created without `tensorboards: "true"` label
2. **No Matching**: PodDefault admission webhook cannot match the pod specification
3. **No Injection**: MinIO credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`) are not injected
4. **Authentication Failure**: TensorBoard attempts to access S3 without credentials
5. **Access Denied**: MinIO rejects unauthenticated requests, resulting in 403 errors

**Why the Label is Critical**:

The `tensorboards: "true"` label serves as a selector for the PodDefault admission webhook. When the Tensorboard controller creates a pod from the CR:

```
Tensorboard CR (with label) 
  → Controller creates Pod template
  → PodDefault Webhook intercepts (matches label)
  → Injects env vars from Secret
  → Pod starts with credentials
  → TensorBoard authenticates with MinIO ✓
```

Without the label:
```
Tensorboard CR (no label)
  → Controller creates Pod template
  → PodDefault Webhook ignores (no match)
  → Pod starts without credentials
  → TensorBoard fails to authenticate with MinIO ✗
```

**The Fix**:

The modification in `utils.py` ensures every Tensorboard CR gets the label:
```python
labels["tensorboards"] = "true"
```

This guarantees that all Tensorboards created through the web app will have credentials injected automatically.

**Diagnostic Commands**:

```bash
# Check if label exists on Tensorboard CR
kubectl get tensorboard <name> -n <namespace> -o jsonpath='{.metadata.labels.tensorboards}'
# Should return: true

# Check if credentials are injected in pod
kubectl get pod -l app=<name> -n <namespace> \
  -o jsonpath='{.items[0].spec.containers[?(@.name=="tensorboard")].env[*].name}'
# Should include: AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_ENDPOINT

# Check istio-proxy logs for authentication errors
kubectl logs -l app=<name> -n <namespace> -c istio-proxy --tail=50 | grep -i "40[13]"
# If credentials are missing, you'll see 401/403 errors to MinIO endpoint
```

**Resolution for Existing Tensorboards**:

```bash
# Add the missing label
kubectl label tensorboard <name> -n <namespace> tensorboards=true

# Force pod recreation to trigger PodDefault injection
kubectl delete pod -l app=<name> -n <namespace>

# Verify credentials are now injected
kubectl get pod -l app=<name> -n <namespace> \
  -o jsonpath='{.items[0].spec.containers[?(@.name=="tensorboard")].env}' | jq .
```
