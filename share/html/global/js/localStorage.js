function loadConfig(configName, defaultConfig = {}, onUnload) {
    let config = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem(configName) || '{}');

            return {
                ...defaultConfig,
                ...stored
            };
        } catch {
            return { ...defaultConfig };
        }
    })();

    window.addEventListener('beforeunload', () => {
        if (onUnload) onUnload(config);
        localStorage.setItem(configName, JSON.stringify(config));
    });

    return config;
}