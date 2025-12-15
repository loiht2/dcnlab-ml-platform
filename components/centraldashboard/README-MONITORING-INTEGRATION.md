# Central Dashboard Monitoring Integration

## Overview

The Kubeflow Central Dashboard has been customized to replace the default dashboard view with an embedded Grafana monitoring iframe. This integration provides users with real-time monitoring and resource usage metrics directly from the main dashboard page.

## Features

- **Embedded Monitoring Dashboard**: Grafana dashboard embedded as an iframe on the home page
- **Dynamic Namespace Integration**: Automatically updates monitoring URL based on selected namespace
- **Configurable via ConfigMap**: All monitoring settings configured through Kubernetes ConfigMap
- **Conditional Rendering**: Shows fallback content when monitoring is not configured
- **Custom Branding**: Footer updated with "Distributed Cloud and Networking Lab - 2025"

## Configuration

### ConfigMap Settings

The monitoring integration is configured through the `centraldashboard-config` ConfigMap. Add the following settings to the `settings` section:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: centraldashboard-config
  namespace: kubeflow
data:
  settings: |-
    {
      "DASHBOARD_FORCE_IFRAME": true,
      "MONITORING_URL": "http://192.168.40.248:30099/d/adcfdqx/kai-scheduler-monitoring-user-view",
      "MONITORING_CLUSTER": "cluster-gpu-1",
      "MONITORING_TITLE": "Dashboard",
      "MONITORING_DESCRIPTION": "View your current resource usage and scheduler metrics for the selected namespace"
    }
```

### Configuration Parameters

| Parameter | Description | Required | Example |
|-----------|-------------|----------|---------|
| `MONITORING_URL` | Base URL of the Grafana dashboard | Yes | `http://192.168.40.248:30099/d/adcfdqx/kai-scheduler-monitoring-user-view` |
| `MONITORING_CLUSTER` | Cluster identifier for the `var-cluster` parameter | No | `cluster-gpu-1` |
| `MONITORING_TITLE` | Title displayed above the monitoring iframe | No | `Dashboard` |
| `MONITORING_DESCRIPTION` | Description text displayed below the title | No | `View your current resource usage...` |

### URL Parameters

The monitoring URL automatically includes the following query parameters:

- `var-queue`: Set to the currently selected namespace (from namespace selector)
- `var-cluster`: Set to the value from `MONITORING_CLUSTER` config (if provided)

The URL builder also preserves any existing query parameters from the base URL (e.g., `theme=dark`, `kiosk`).

## Implementation Details

### Modified Files

1. **config/centraldashboard-config.yaml**
   - Added monitoring configuration to the `settings` section

2. **public/components/main-page.pug**
   - Added `iron-ajax` call to fetch dashboard settings from `/api/dashboard-settings`
   - Hidden Dashboard and Activity tabs (`display: none`)
   - Replaced `dashboard-view` with monitoring container
   - Added conditional rendering based on `monitoringUrl` availability
   - Updated footer text with custom branding

3. **public/components/main-page.js**
   - Added properties: `monitoringUrl`, `monitoringCluster`, `monitoringTitle`, `monitoringDescription`
   - Implemented `_buildMonitoringUrl(namespace, baseUrl, cluster)` method
   - Implemented `_onDashboardSettingsResponse(ev)` handler
   - Integrated with namespace selector through `queryParams.ns`

### Code Flow

1. Page loads and fetches settings via `/api/dashboard-settings`
2. `_onDashboardSettingsResponse()` processes the ConfigMap settings
3. User selects a namespace using the namespace selector
4. `queryParams.ns` updates automatically
5. `_buildMonitoringUrl()` is called with new namespace value
6. Iframe URL updates with new `var-queue` parameter
7. Grafana dashboard reloads with namespace-specific data

## Usage

### For Users

1. **Select Namespace**: Use the namespace selector in the top toolbar
2. **View Metrics**: The monitoring dashboard automatically updates to show metrics for the selected namespace
3. **Navigate**: Use the sidebar menu to access other Kubeflow features (Notebooks, Pipelines, etc.)

### For Administrators

#### Enable Monitoring

1. Update the ConfigMap with your Grafana dashboard URL:
   ```bash
   kubectl edit configmap centraldashboard-config -n kubeflow
   ```

2. Add the monitoring settings to the `settings` section

3. Restart the centraldashboard pod to apply changes:
   ```bash
   kubectl rollout restart deployment centraldashboard -n kubeflow
   ```

#### Disable Monitoring

Remove or comment out the `MONITORING_URL` setting in the ConfigMap. The dashboard will show a welcome message instead.

## UI Components

### With Monitoring Enabled

```
┌─────────────────────────────────────────┐
│ Dashboard          │
│ View your current resource usage and... │
├─────────────────────────────────────────┤
│                                         │
│         [Grafana Dashboard]             │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

### Without Monitoring Enabled

```
┌─────────────────────────────────────────┐
│   Welcome to Kubeflow Central Dashboard │
│                                         │
│   Please configure monitoring settings  │
│   in the centraldashboard-config...     │
└─────────────────────────────────────────┘
```

## Troubleshooting

### Iframe Not Loading

1. Check ConfigMap settings:
   ```bash
   kubectl get configmap centraldashboard-config -n kubeflow -o yaml
   ```

2. Verify the monitoring URL is accessible from the browser

3. Check browser console for CORS or mixed content errors

### Namespace Not Updating

1. Verify `queryParams.ns` is being populated (check browser DevTools)
2. Ensure namespace selector is visible and functional
3. Check that the Grafana dashboard accepts the `var-queue` parameter

### Settings Not Loading

1. Ensure the centraldashboard pod has restarted after ConfigMap changes
2. Check pod logs for errors:
   ```bash
   kubectl logs -n kubeflow deployment/centraldashboard
   ```

3. Verify `/api/dashboard-settings` endpoint returns the correct data

## Development Notes

### Testing Changes

1. Build the dashboard:
   ```bash
   npm run build
   ```

2. Rebuild the Docker image:
   ```bash
   docker build -t <your-registry>/centraldashboard:custom .
   ```

3. Update the deployment to use your custom image

### ESLint Compliance

The code follows ESLint rules with max line length of 80 characters. Long lines are broken into multiple lines for compliance.

## Future Enhancements

- Support for multiple monitoring dashboards per namespace
- Dashboard selection dropdown
- Role-based access control for monitoring views
- Embedded metrics without external Grafana dependency
- Customizable iframe height based on content

## References

- [Kubeflow Central Dashboard](https://github.com/kubeflow/kubeflow/tree/master/components/centraldashboard)
- [Polymer 3 Documentation](https://polymer-library.polymer-project.org/3.0/docs/devguide/feature-overview)
- [Grafana URL Variables](https://grafana.com/docs/grafana/latest/variables/)

---

**Last Updated**: December 15, 2025  
**Version**: Custom Monitoring Integration v1.0
