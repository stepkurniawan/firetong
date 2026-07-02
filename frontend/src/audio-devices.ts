export type AudioInputOption = {
  deviceId: string;
  label: string;
};

export async function listAudioInputOptions(
  browserNavigator: Navigator = navigator,
): Promise<AudioInputOption[]> {
  if (!browserNavigator.mediaDevices?.enumerateDevices) return [];

  const devices = await browserNavigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Microphone ${index + 1}`,
    }));
}
