
// WhatsHybrid - License & Trial helper (for extension pages)
// Provides: window.whatsHybridLicense with getState() and isPremiumFeatureAllowed()

(function() {
  // ---------------------------------------------------------------------------
  // MASTER KEY (override total de permissões)
  // ---------------------------------------------------------------------------
  // Requisito: chave master fixa e global.
  const MASTER_KEY = "Cristi@no123";
  const MASTER_PLAN = "enterprise";
  // “Praticamente infinito” sem estourar Int (32-bit)
  const MASTER_AI_CREDITS = 2147483647;

  const TRIAL_DAYS = 3;

  function computeTrialInfo(firstInstallAt) {
    if (!firstInstallAt) {
      return { isTrial: true, isTrialActive: true, daysUsed: 0 };
    }
    const now = Date.now();
    const diffMs = now - firstInstallAt;
    const days = diffMs / (1000 * 60 * 60 * 24);
    const isTrialActive = days <= TRIAL_DAYS;
    return { isTrial: true, isTrialActive, daysUsed: days };
  }

  function getState(callback) {
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      callback({
        isLicensed: false,
        isTrialActive: false,
        status: "unknown"
      });
      return;
    }
    chrome.storage.sync.get(
      ["firstInstallAt", "licenseKey", "licenseStatus", "licensePlan", "licenseMessage", "licenseAiEnabled", "licenseAiCredits", "licenseIsMaster"],
      (data) => {
        const firstInstallAt = data.firstInstallAt || null;
        const trialInfo = computeTrialInfo(firstInstallAt);
        const key = (data.licenseKey || "").toString().trim();
        const isMaster = key === MASTER_KEY || data.licenseIsMaster === true;
        const isLicensed = data.licenseStatus === "licensed" || isMaster;
        const isTrialActive = !isLicensed && trialInfo.isTrialActive;
        const aiEnabled = isMaster ? true : (data.licenseAiEnabled === true);
        const aiCredits = isMaster
          ? (typeof data.licenseAiCredits === "number" ? data.licenseAiCredits : MASTER_AI_CREDITS)
          : (typeof data.licenseAiCredits === "number" ? data.licenseAiCredits : null);

        callback({
          firstInstallAt,
          licenseKey: key || null,
          licenseStatus: isMaster ? "licensed" : (data.licenseStatus || (isLicensed ? "licensed" : "free_trial")),
          licensePlan: isMaster ? MASTER_PLAN : (data.licensePlan || null),
          licenseMessage: data.licenseMessage || null,
          isLicensed,
          isTrialActive,
          trialInfo,
          TRIAL_DAYS,
          aiEnabled,
          aiCredits,
          isMaster
        });
      }
    );
  }

  function isPremiumFeatureAllowed(feature, callback) {
    getState((state) => {
      const isCorePremium = state.isLicensed || state.isTrialActive;

      // Master key: libera tudo e ignora restrições (inclusive créditos).
      if (state.isMaster) {
        callback(true, state);
        return;
      }

      // Recursos de IA (chatbot, insights, smart replies, copiloto)
      if (feature === "ai" || feature === "ai_insights" || feature === "ai_copilot" || feature === "smart_replies") {
        const canUseAi = state.aiEnabled && typeof state.aiCredits === "number" && state.aiCredits > 0;
        callback(canUseAi, state);
        return;
      }

      // Demais recursos premium seguem regra antiga (licença ou trial)
      if (isCorePremium) {
        callback(true, state);
      } else {
        callback(false, state);
      }
    });
  }

  window.whatsHybridLicense = {
    getState,
    isPremiumFeatureAllowed,
    TRIAL_DAYS
  };
})();
