import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { NamespaceService, DIALOG_RESP } from 'kubeflow';
import { TWABackendService } from 'src/app/services/backend.service';
import { TensorboardPostObject } from 'src/app/types';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss'],
})
export class FormComponent implements OnInit, OnDestroy {
  public subs = new Subscription();
  public formCtrl: FormGroup;
  public blockSubmit = false;

  public currNamespace = '';
  public tensorboardNames = new Set<string>();
  public pvcNames: string[] = [];
  public storageType = 'object_store';
  public configurations = [];

  constructor(
    public ns: NamespaceService,
    public fb: FormBuilder,
    public backend: TWABackendService,
    public dialog: MatDialogRef<FormComponent>,
  ) {
    this.formCtrl = this.fb.group({
      name: ['', [Validators.required]],
      namespace: ['', [Validators.required]],
      storage: ['object_store', [Validators.required]],
      storageProvider: ['minio', [Validators.required]],
      bucket: ['', [Validators.required]],
      prefix: ['', []],
      endpoint: ['minio-system', [Validators.required]],
      pvcName: ['', [Validators.nullValidator]],
      pvcMountPath: ['', [Validators.nullValidator]],
      configurations: [[], []],
    });
  }

  ngOnInit() {
    this.formCtrl.controls.namespace.disable();

    this.subs.add(
      this.ns.getSelectedNamespace().subscribe(ns => {
        this.currNamespace = ns;
        this.formCtrl.controls.namespace.setValue(ns);

        this.backend.getTensorBoards(ns).subscribe(tensorboards => {
          this.tensorboardNames.clear();
          tensorboards.forEach(tensorboard =>
            this.tensorboardNames.add(tensorboard.name),
          );
        });
      }),
    );

    this.subs.add(
      this.formCtrl.get('storage').valueChanges.subscribe(stType => {
        this.storageType = stType;
        if (stType === 'pvc') {
          this.backend.getPVCNames(this.currNamespace).subscribe(pvcs => {
            this.pvcNames = pvcs;
          });

          this.formCtrl.removeControl('storageProvider');
          this.formCtrl.removeControl('bucket');
          this.formCtrl.removeControl('prefix');
          this.formCtrl.removeControl('endpoint');
          this.formCtrl.addControl(
            'pvcName',
            new FormControl('', [Validators.required]),
          );
        }
        if (stType === 'object_store') {
          this.formCtrl.removeControl('pvcName');
          this.formCtrl.addControl(
            'storageProvider',
            new FormControl('minio', [Validators.required]),
          );
          this.formCtrl.addControl(
            'bucket',
            new FormControl('', [Validators.required]),
          );
          this.formCtrl.addControl(
            'prefix',
            new FormControl('', []),
          );
          this.formCtrl.addControl(
            'endpoint',
            new FormControl('minio-system', [Validators.required]),
          );
        }
      }),
    );

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
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  public onSubmit() {
    let logspath: string;
    const tensorboard: TensorboardPostObject = {
      name: this.formCtrl.get('name').value,
      logspath: '',
      configurations: this.formCtrl.get('configurations').value,
    };

    if (this.storageType === 'pvc') {
      logspath =
        'pvc://' +
        this.formCtrl.get('pvcName').value +
        '/' +
        this.formCtrl.get('pvcMountPath').value;
      tensorboard.logspath = logspath;
    } else {
      // For object store, construct s3:// path and pass additional fields
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

    this.blockSubmit = true;

    this.backend.createTensorboard(this.currNamespace, tensorboard).subscribe(
      result => {
        this.dialog.close(DIALOG_RESP.ACCEPT);
      },
      error => {
        this.blockSubmit = false;
      },
    );
  }

  public onCancel() {
    this.dialog.close(DIALOG_RESP.CANCEL);
  }
}
