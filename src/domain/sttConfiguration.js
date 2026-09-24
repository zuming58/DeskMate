export const BAILIAN_REALTIME_STT_PROVIDER = "qwen3-asr-flash-realtime";

export function repairCredentialBackedSttConfiguration({ settings = {}, diagnostics = {}, bailianStatus } = {}) {
  if (settings.sttMode !== "unconfigured" || bailianStatus?.configured !== true) return null;
  return {
    settings: { ...settings, sttMode: "bailian", sttEndpoint: "" },
    diagnostics: {
      ...diagnostics,
      stt: {
        ...(diagnostics.stt || {}),
        status: "pending",
        provider: BAILIAN_REALTIME_STT_PROVIDER,
        error: "",
        errorType: "",
      },
    },
  };
}
