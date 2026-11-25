// Account workspaces must never reload from the device-only backup or auth storage events.
export function reloadDeviceData(cloud: boolean, changedKey: string | null, deviceKey: string) {
  return !cloud && (changedKey === deviceKey || changedKey === null);
}
