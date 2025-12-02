from kubeflow.kubeflow.crud_backend import status
from werkzeug.exceptions import BadRequest


def parse_tensorboard(tensorboard):
    """
    Process the Tensorboard object and format it as the UI expects it.
    """
    if tensorboard.get("status", {}).get("readyReplicas", 0) == 1:
        phase = status.STATUS_PHASE.READY
        message = "The Tensorboard server is ready to connect"
    else:
        phase = status.STATUS_PHASE.UNAVAILABLE
        message = "The Tensorboard server is currently unavailble"

    parsed_tensorboard = {
        "name": tensorboard["metadata"]["name"],
        "namespace": tensorboard["metadata"]["namespace"],
        "logspath": tensorboard["spec"]["logspath"],
        "age": tensorboard["metadata"]["creationTimestamp"],
        "status": status.create_status(phase, message, "")
    }

    return parsed_tensorboard


def get_tensorboard_dict(namespace, body):
    """
    Create Tensorboard object from request body and format it as a Python dict.
    """
    metadata = {
        "name": body["name"],
        "namespace": namespace,
    }
    labels = get_tensorboard_configurations(body=body)
    if not labels:
        labels = {}
    # Add tensorboards label for identification and RBAC
    labels["tensorboards"] = "true"
    metadata["labels"] = labels

    spec = {"logspath": body["logspath"]}
    
    # Add annotations for MinIO access if using S3/object store
    if body["logspath"].startswith("s3://"):
        if "annotations" not in metadata:
            metadata["annotations"] = {}
        
        # Add MinIO endpoint annotation for tensorboard-controller to use
        if "endpoint" in body and body["endpoint"]:
            endpoint_value = body["endpoint"]
            # Convert display value 'minio-system' to full URL
            if endpoint_value == "minio-system":
                endpoint_value = "http://minio.minio-system.svc.cluster.local:9000"
            metadata["annotations"]["s3-endpoint"] = endpoint_value

    tensorboard = {
        "apiVersion": "tensorboard.kubeflow.org/v1alpha1",
        "kind": "Tensorboard",
        "metadata": metadata,
        "spec": spec,
    }

    return tensorboard


def get_tensorboard_configurations(body):
    labels = body.get("configurations", None)
    cr_labels = {}

    if not isinstance(labels, list):
        raise BadRequest("Labels for PodDefaults are not list: %s" % labels)

    for label in labels:
        cr_labels[label] = "true"

    return cr_labels
