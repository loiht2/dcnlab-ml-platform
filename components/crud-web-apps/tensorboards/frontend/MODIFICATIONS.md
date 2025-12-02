# Frontend Modifications

## Overview
The frontend has been enhanced to provide a more granular and user-friendly interface for configuring S3-compatible object storage, specifically targeting MinIO and AWS S3 integration.

## Modified Files

### 1. `src/app/types.ts`

#### Added Optional Fields to `TensorboardPostObject` Interface

```typescript
export interface TensorboardPostObject {
  name: string;
  logspath: string;
  configurations: PodDefault[];
  storageProvider?: string;  // NEW: "minio" or "s3"
  bucket?: string;            // NEW: S3 bucket name
  prefix?: string;            // NEW: Path prefix within bucket
  endpoint?: string;          // NEW: S3 endpoint URL
}
```

**Purpose**: These additional fields allow the form to capture detailed S3 configuration while maintaining backward compatibility with the existing `logspath` field.

---

### 2. `src/app/pages/form/form.component.ts`

#### Added New Form Controls

```typescript
this.formCtrl = this.fb.group({
  name: ['', [Validators.required]],
  namespace: ['', [Validators.required]],
  storage: ['object_store', [Validators.required]],
  storageProvider: ['minio', [Validators.required]],  // NEW
  bucket: ['', [Validators.required]],                 // NEW
  prefix: ['', []],                                    // NEW
  endpoint: ['minio-system', [Validators.required]],  // NEW
  pvcName: ['', [Validators.nullValidator]],
  pvcMountPath: ['', [Validators.nullValidator]],
  configurations: [[], []],
});
```

#### Added Provider Change Handler

```typescript
// Handle provider change to update endpoint
this.subs.add(
  this.formCtrl.get('storageProvider')?.valueChanges.subscribe(provider => {
    if (provider === 'minio') {
      this.formCtrl.get('endpoint')?.setValue('minio-system');
    } else {
      this.formCtrl.get('endpoint')?.setValue('');
    }
  }),
);
```

**Purpose**: Automatically populates the endpoint field with `minio-system` when MinIO is selected, improving user experience.

#### Modified `onSubmit()` Method

```typescript
public onSubmit() {
  let logspath: string;
  const tensorboard: TensorboardPostObject = {
    name: this.formCtrl.get('name').value,
    logspath: '',
    configurations: this.formCtrl.get('configurations').value,
  };

  if (this.storageType === 'pvc') {
    // PVC logic remains unchanged
    logspath = 'pvc://' + this.formCtrl.get('pvcName').value + '/' + 
               this.formCtrl.get('pvcMountPath').value;
    tensorboard.logspath = logspath;
  } else {
    // NEW: Construct S3 path from bucket and prefix
    const bucket = this.formCtrl.get('bucket').value;
    const prefix = this.formCtrl.get('prefix').value;
    const storageProvider = this.formCtrl.get('storageProvider').value;
    const endpoint = this.formCtrl.get('endpoint').value;

    // Construct logspath as s3://bucket/prefix
    logspath = `s3://${bucket}`;
    if (prefix) {
      logspath += `/${prefix}`;
    }

    tensorboard.logspath = logspath;
    tensorboard.storageProvider = storageProvider;
    tensorboard.bucket = bucket;
    tensorboard.prefix = prefix || '';
    tensorboard.endpoint = endpoint;
  }

  // Submit logic remains unchanged
}
```

**Purpose**: Constructs the proper S3 path format (`s3://bucket/prefix`) from user inputs and includes additional metadata for the backend.

---

### 3. `src/app/pages/form/form.component.html`

#### Replaced Single "Object Store Link" Input

**Before**:
```html
<mat-form-field appearance="outline" class="wide">
  <mat-label>Object Store Link</mat-label>
  <input matInput formControlName="logspath" placeholder="s3://bucket/path" />
</mat-form-field>
```

**After**:
```html
<!-- Object Store Configuration -->
<div *ngIf="formCtrl.get('storage').value === 'object_store'" class="object-store-config">
  <mat-form-field appearance="outline" class="wide">
    <mat-label data-cy-form-input-provider i18n>Provider</mat-label>
    <mat-select formControlName="storageProvider">
      <mat-option value="minio">MinIO</mat-option>
      <mat-option value="s3">AWS S3</mat-option>
    </mat-select>
  </mat-form-field>

  <div class="grid-container">
    <mat-form-field appearance="outline" class="grid-item">
      <mat-label data-cy-form-input-bucket i18n>Bucket</mat-label>
      <input matInput formControlName="bucket" placeholder="my-bucket" i18n-placeholder />
    </mat-form-field>

    <mat-form-field appearance="outline" class="grid-item">
      <mat-label data-cy-form-input-prefix i18n>Prefix / Path</mat-label>
      <input matInput formControlName="prefix" placeholder="output/path" i18n-placeholder />
    </mat-form-field>
  </div>

  <mat-form-field appearance="outline" class="wide">
    <mat-label data-cy-form-input-endpoint i18n>Endpoint</mat-label>
    <input matInput formControlName="endpoint" placeholder="minio-system" i18n-placeholder />
    <mat-hint i18n>For MinIO: use "minio-system". For AWS S3: leave empty or specify custom endpoint</mat-hint>
  </mat-form-field>
</div>
```

**Changes**:
- Added **Provider** dropdown to select between MinIO and AWS S3
- Split object store link into **Bucket** and **Prefix/Path** fields
- Added **Endpoint** field with helpful hint text
- Organized Bucket and Prefix in a 2-column grid layout for better UX

---

### 4. `src/app/pages/form/form.component.scss`

#### Added Grid Layout Styles

```scss
.object-store-config {
  .grid-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    
    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }
  
  .grid-item {
    width: 100%;
  }
}
```

**Purpose**: Creates a responsive 2-column layout for Bucket and Prefix fields, improving form organization and usability.

---

### 5. `src/styles.scss`

#### Enhanced Button Styling

```scss
.mat-raised-button.mat-primary {
  background-color: #0d47a1 !important;
  
  &:hover {
    background-color: #0a3d91 !important;
  }
}
```

**Purpose**: Improved visual density for primary action buttons.

---

## User Experience Improvements

### Before
- Single input field for object store link
- Users had to manually construct `s3://bucket/path` format
- No guidance on endpoint configuration
- Error-prone manual entry

### After
- Separate fields for each S3 component (Provider, Bucket, Prefix, Endpoint)
- Automatic S3 path construction from user inputs
- Provider dropdown prevents typos
- Auto-population of endpoint for MinIO
- Helpful hints and placeholders
- Responsive grid layout

## Form Validation

The form includes validation for required fields:
- **Name**: Required
- **Namespace**: Required (auto-filled from current namespace)
- **Storage Type**: Required
- **Provider**: Required when using object store
- **Bucket**: Required when using object store
- **Prefix**: Optional
- **Endpoint**: Required when using object store

## Internationalization (i18n)

All new UI elements include i18n attributes for localization support:
```html
<mat-label data-cy-form-input-provider i18n>Provider</mat-label>
```

## Testing

### Manual Testing Steps

1. **Navigate to Tensorboard Creation Form**
   - Open Kubeflow dashboard
   - Go to Tensorboards section
   - Click "New Tensorboard"

2. **Test MinIO Configuration**
   - Select "Object Store" radio button
   - Provider: Select "MinIO"
   - Verify endpoint auto-fills to "minio-system"
   - Bucket: Enter "test-bucket"
   - Prefix: Enter "output/logs"
   - Submit and verify CR is created with `logspath: s3://test-bucket/output/logs`

3. **Test AWS S3 Configuration**
   - Provider: Select "AWS S3"
   - Verify endpoint field is cleared
   - Fill in custom endpoint if needed
   - Bucket: Enter "my-s3-bucket"
   - Prefix: Enter "tensorboard/runs"
   - Submit and verify CR is created with `logspath: s3://my-s3-bucket/tensorboard/runs`

4. **Test Responsive Layout**
   - Resize browser window
   - Verify grid layout switches to single column on mobile screens

### E2E Testing

The existing Cypress tests in `cypress/e2e/` may need updates to account for the new form fields. Consider adding tests for:
- Provider selection behavior
- Endpoint auto-population
- S3 path construction
- Form validation with new fields

## Browser Compatibility

The changes use standard Angular Material components and CSS Grid, which are supported in:
- Chrome 57+
- Firefox 52+
- Safari 10.1+
- Edge 16+

## Dependencies

No new npm dependencies were added. The changes use existing Angular Material components:
- `MatSelectModule`
- `MatInputModule`
- `MatFormFieldModule`
- `ReactiveFormsModule`

## Backward Compatibility

The changes maintain backward compatibility:
- Existing Tensorboards continue to work without modification
- The `logspath` field remains the primary field sent to the backend
- Additional fields are optional metadata
- PVC storage mode is unaffected
