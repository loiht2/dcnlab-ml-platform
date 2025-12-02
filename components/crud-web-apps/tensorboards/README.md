# Tensorboards web app

This web app is responsible for allowing the user to manipulate Tensorboard instances in their Kubeflow cluster. To achieve this it provides a user friendly way to handle the lifecycle of Tensorboard CRs.

- The Tensorboards web app's UI is simple and intuitive
![Index Page](https://github.com/kandrio98/kubeflow/blob/pictures-branch/components/crud-web-apps/tensorboards/pictures/index_page.png?raw=true)

- It follows the style of the Jupyter web-app
![Create Form](https://github.com/kandrio98/kubeflow/blob/pictures-branch/components/crud-web-apps/tensorboards/pictures/create_tensorboard_form.png?raw=true)
- You can create, delete, list Tensorboard CRs and connect to Tensorboard servers to visualize your logs
![Delete Tensorboard](https://github.com/kandrio98/kubeflow/blob/pictures-branch/components/crud-web-apps/tensorboards/pictures/delete_tensorboard_dialog.png?raw=true)

## Recent Modifications (December 2025)

### Object Store Configuration Enhancement

The Tensorboard web app has been enhanced to support detailed S3-compatible object store configuration, specifically for MinIO integration.

#### Key Changes

1. **Enhanced Form Interface**: The creation form now provides granular object store configuration fields instead of a single "Object Store Link" input:
   - **Provider**: Dropdown to select storage provider (MinIO or AWS S3)
   - **Bucket**: Input field for S3 bucket name
   - **Prefix/Path**: Input field for object path within the bucket
   - **Endpoint**: Endpoint URL (auto-populated for MinIO, editable for AWS S3)

2. **S3 Path Construction**: The backend automatically constructs proper S3 paths in the format `s3://bucket/prefix` from the user-provided bucket and prefix values.

3. **PodDefault Integration**: Added support for automatic credential injection via Kubernetes PodDefaults:
   - Tensorboard CRs are created with the label `tensorboards: "true"`
   - PodDefaults with matching selector automatically inject MinIO/S3 credentials into Tensorboard pods
   - Injected environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`

4. **MinIO Endpoint Annotation**: S3 object store configurations include an `s3-endpoint` annotation on the Tensorboard CR metadata for MinIO endpoint tracking.

#### Prerequisites for MinIO Integration

1. **MinIO Service**: Ensure MinIO is deployed and accessible (e.g., `minio.minio-system.svc.cluster.local:9000`)

2. **Credentials Secret**: Create a Kubernetes secret containing MinIO credentials:
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: minio-secret
     namespace: <user-namespace>
   type: Opaque
   stringData:
     AWS_ACCESS_KEY_ID: "<minio-access-key>"
     AWS_SECRET_ACCESS_KEY: "<minio-secret-key>"
     S3_ENDPOINT: "http://minio.minio-system.svc.cluster.local:9000"
   ```

3. **PodDefault Configuration**: Create a PodDefault to inject credentials:
   ```yaml
   apiVersion: kubeflow.org/v1alpha1
   kind: PodDefault
   metadata:
     name: add-minio-secret
     namespace: <user-namespace>
   spec:
     desc: Add MinIO credentials
     selector:
       matchLabels:
         tensorboards: "true"
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

#### Usage Example

1. Navigate to the Tensorboards web app in Kubeflow
2. Click "New Tensorboard"
3. Fill in the form:
   - Name: `my-tensorboard`
   - Storage: Select "Object Store"
   - Provider: Select "MinIO"
   - Bucket: `my-bucket`
   - Prefix/Path: `output/logs`
   - Endpoint: `minio-system` (auto-filled)
4. The system will create a Tensorboard with:
   - logspath: `s3://my-bucket/output/logs`
   - Label: `tensorboards: "true"`
   - Annotation: `s3-endpoint: "http://minio.minio-system.svc.cluster.local:9000"`
5. The PodDefault automatically injects MinIO credentials into the Tensorboard pod
6. TensorBoard can now access logs from MinIO S3 storage

#### Troubleshooting: RBAC Access Denied Error

**Problem**: When accessing a Tensorboard through the browser, you receive an HTTP 403 error with the message "RBAC: access denied".

**Root Cause**: The Tensorboard pod is attempting to access MinIO S3 storage but lacks the necessary AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`). Without these credentials, the Tensorboard cannot authenticate with MinIO, resulting in access denied errors.

**Why This Happens**:
1. **Missing Label on Tensorboard CR**: If the Tensorboard custom resource (CR) doesn't have the label `tensorboards: "true"`, the PodDefault admission webhook cannot match it
2. **PodDefault Not Configured**: If no PodDefault exists with a selector matching `tensorboards: "true"`, credentials won't be injected
3. **Wrong Secret Name or Keys**: If the PodDefault references a secret that doesn't exist or uses incorrect keys
4. **Namespace Mismatch**: The secret and PodDefault must exist in the same namespace as the Tensorboard

**How the Fix Works**:
The modifications ensure that:
1. Every Tensorboard CR created through the web app automatically gets the label `tensorboards: "true"`
2. When the Tensorboard controller creates a pod from the CR, the PodDefault admission webhook detects the label
3. The webhook injects the MinIO credentials from the secret into the pod's environment variables
4. TensorBoard can now authenticate with MinIO and access the S3 bucket

**Verification Steps**:
```bash
# 1. Check if the Tensorboard CR has the correct label
kubectl get tensorboard <name> -n <namespace> -o jsonpath='{.metadata.labels}'
# Expected output should include: {"tensorboards":"true"}

# 2. Check if the pod has injected environment variables
kubectl get pod -l app=<tensorboard-name> -n <namespace> \
  -o jsonpath='{.items[0].spec.containers[?(@.name=="tensorboard")].env}' | jq .
# Expected output should show: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_ENDPOINT

# 3. Check if the secret exists
kubectl get secret minio-secret -n <namespace>

# 4. Check if the PodDefault exists and has correct selector
kubectl get poddefault add-minio-secret -n <namespace> -o yaml
# Verify selector.matchLabels contains: tensorboards: "true"
```

**Manual Fix for Existing Tensorboards**:
If you have existing Tensorboards created before this modification:
```bash
# Add the label to existing Tensorboard CR
kubectl label tensorboard <name> -n <namespace> tensorboards=true

# Delete the pod to force recreation with injected credentials
kubectl delete pod -l app=<tensorboard-name> -n <namespace>

# The Tensorboard controller will recreate the pod, and the PodDefault will inject credentials
```

#### Docker Image

The updated web app is available at:
```
loihoangthanh1411/tensorboards-web-app:latest
```

To build locally:
```bash
cd components/crud-web-apps
docker build -t tensorboards-web-app:latest -f tensorboards/Dockerfile .
```
## Development

Requirements:
* node 16.20.2
* python 3.8

### Frontend

```bash
# build the common library
cd components/crud-web-apps/common/frontend/kubeflow-common-lib
npm i
npm run build
cd dist/kubeflow
npm link

# build the app frontend
cd ../../../tensorboards/frontend
npm i
npm link kubeflow
npm run build:watch
```

### Backend
```bash
# create a virtual env and install deps
# https://packaging.python.org/guides/installing-using-pip-and-virtual-environments/
cd component/crud-web-apps/tensorboards/backend
python3.8 -m pip install --user virtualenv
python3.8 -m venv web-apps-dev
source web-apps-dev/bin/activate

# install the deps on the activated virtual env
make -C backend install-deps

# run the backend
make -C backend run-dev
```

### internationalization
support for non-english languages is only supported in a best effort way.

internationalization(i18n) was implemented using [angular's i18n](https://angular.io/guide/i18n)
guide and practices, in the frontend. you can use the following methods to
ensure the text of the app will be localized:
1. `i18n` attribute in html elements, if the node's text should be translated
2. `i18n-{attribute}` in an html element, if the element's attribute should be
   translated
3. [$localize](https://angular.io/api/localize/init/$localize) to mark text in
   typescript variables that should be translated

the file for the english text is located under `i18n/messages.xlf` and other
languages under their respective locale folder, i.e. `i18n/fr/messages.fr.xfl`.
each language's folder, aside from english, should have a distinct and up to
date owners file that reflects the maintainers of that language.

**testing**

you can run a different translation of the app, locally, by running
```bash
ng serve --configuration=fr
```

you must also ensure that the backend is running, since angular's dev server
will be proxying request to the backend at `localhost:5000`.

### Run the Tensorboards Controller
Since the Tensorboards controller is not currently a part of the manifests you will need to manually run the [Tensorboard Controller](https://github.com/kubeflow/kubeflow/blob/master/components/tensorboard-controller/README.md)
### Connect to the Tensorboard Server

Since the TWA is not yet fully integrated with Kubeflow, in order to connect to a created Tensorboard server, you can:
1. Run: `kubectl port-forward svc/istio-ingressgateway -n istio-system 8000:80`
2. Go to: `localhost:8000` to login to Kubeflow
3. Change to: `localhost:8000/tensorboard/<namespace>/<name>/` in order to visualize your logs, where `name` and `namespace` are the metadata of the Tensorboard CR

![Tensorboard Server](https://github.com/kandrio98/kubeflow/blob/pictures-branch/components/crud-web-apps/tensorboards/pictures/tensorboard_server.png?raw=true)
## GSoC 2020

This part of the project entails the [code for the FRONTEND and BACKEND](https://github.com/kubeflow/kubeflow/tree/master/components/crud-web-apps/tensorboards) of the Tensorboard web-app. The project also entailed extending the Tensorboard controller to support RWO PVCs as log storages for Tensorboard servers. You can find the code for the Tensorboard controller [here](https://github.com/kubeflow/kubeflow/tree/master/components/tensorboard-controller), and you can also find the corresponding documentation [here](https://github.com/kubeflow/kubeflow/blob/master/components/tensorboard-controller/README.md).

# Challenges of the project

Due to the nature of this project, which entailed the development of 3 major parts of the TWA (controller, backend and frontend), we faced a lot of difficulties during the summer. These mainly included building errors and library code malfunctions. Kimonas and Ilias, my mentors, were really helpful as the always provided feedback and made sure I was moving towards the right direction.

In addition, the covid-19 pandemic greatly affected my work schedule as my college exams were pushed forward in the summer and scheduled in July, which was a crucial month for the development of my GSoC project.

# Further Improvements

I hope to be able to maintain and improve the TWA, using it where possibly throughout my further studies. Some identifiable improvements are:

- The creation of a scipt to auto build the Tensorboard web app image
- The integration of the TWA in the Kubeflow dashboard
- The development of an [extensible story](https://github.com/kubeflow/kubeflow/issues/3578#issuecomment-655724933) for deploying our stateful apps, like Jupyter and Tensorboard

# Acknowledgements

First and foremost, I would like to thank my mentors Kimonas and Ilias. Both of them, despite their busy timelines were always willing to answer my (very often) questions and provide suggestions. They were always there for me, and I can't thank them enough for that. Also, Kubeflow, which introduced me to the world of open-source programming and gave me the opportunity to work on such an exiting project. Finally the Google Summer of Code program, that provided the necessary funding so I could undertake this project throughout the summer months and have a wonderful experience.
